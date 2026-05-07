/**
 * POST /api/reservations
 *
 * Buat reservasi baru. Auto-resolve hotel_id, guest_id, dan total_price
 * dari room yang dipilih + token pengguna.
 *
 * Header: Authorization: Bearer <token>
 * Body: { room_id, check_in, check_out, booking_source?, payment_method?, special_requests? }
 *
 * Response 201: { reservation: { id, ... } }
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  extractToken,
  getSupabaseWithToken,
  unauthorized,
} from '../benchmark/_lib/supabase';

type BookingSource = 'walk_in' | 'ota' | 'corporate' | 'travel_agent';

const VALID_BOOKING_SOURCES: BookingSource[] = ['walk_in', 'ota', 'corporate', 'travel_agent'];

function mapBookingSource(input?: string): BookingSource {
  if (!input) return 'walk_in';
  if (VALID_BOOKING_SOURCES.includes(input as BookingSource)) return input as BookingSource;
  if (input === 'online') return 'ota';
  return 'walk_in';
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return unauthorized();

  try {
    const body = await req.json();
    const {
      room_id,
      check_in,
      check_out,
      booking_source,
      payment_method,
      special_requests,
    } = body;

    if (!room_id || !check_in || !check_out) {
      return NextResponse.json(
        { error: 'room_id, check_in, dan check_out wajib diisi' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseWithToken(token);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Token tidak valid' }, { status: 401 });
    }

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, hotel_id, room_type:room_types(price_per_night)')
      .eq('id', room_id)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room tidak ditemukan' }, { status: 404 });
    }

    const hotel_id: string = room.hotel_id;
    const roomType = Array.isArray(room.room_type) ? room.room_type[0] : room.room_type;
    const pricePerNight: number = roomType?.price_per_night ?? 0;

    const msPerDay = 1000 * 60 * 60 * 24;
    const nights = Math.max(
      1,
      Math.round((new Date(check_out).getTime() - new Date(check_in).getTime()) / msPerDay)
    );
    const total_price = nights * pricePerNight;

    const userEmail = user.email!;
    let guestId: string;

    const { data: existingGuest } = await supabase
      .from('guests')
      .select('id')
      .eq('hotel_id', hotel_id)
      .eq('email', userEmail)
      .maybeSingle();

    if (existingGuest) {
      guestId = existingGuest.id;
    } else {
      const displayName: string =
        (user.user_metadata?.full_name as string | undefined) ?? userEmail.split('@')[0];

      const { data: newGuest, error: guestError } = await supabase
        .from('guests')
        .insert({ hotel_id, full_name: displayName, email: userEmail, title: 'Mr.' })
        .select('id')
        .single();

      if (guestError) {
        // Race condition — try to fetch the guest that was just created by a concurrent request
        if (guestError.code === '23505') {
          const { data: raceGuest } = await supabase
            .from('guests')
            .select('id')
            .eq('hotel_id', hotel_id)
            .eq('email', userEmail)
            .single();
          if (!raceGuest) {
            return NextResponse.json({ error: 'Gagal membuat data guest' }, { status: 500 });
          }
          guestId = raceGuest.id;
        } else {
          return NextResponse.json(
            { error: `Gagal membuat guest: ${guestError.message}` },
            { status: 500 }
          );
        }
      } else {
        guestId = newGuest!.id;
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from('reservations')
      .insert({
        hotel_id,
        guest_id: guestId,
        room_id,
        check_in_date: check_in,
        check_out_date: check_out,
        total_price,
        payment_status: 'pending',
        payment_method: payment_method ?? null,
        booking_source: mapBookingSource(booking_source),
        special_requests: special_requests ?? null,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { data: full, error: fetchError } = await supabase
      .from('reservations')
      .select(`
        *,
        guest:guests(id, full_name, email),
        room:rooms(id, room_number, room_type:room_types(id, name, price_per_night)),
        hotel:hotels(name)
      `)
      .eq('id', inserted.id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Reservasi dibuat tapi gagal memuat detail.' }, { status: 500 });
    }

    return NextResponse.json({ reservation: full }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
