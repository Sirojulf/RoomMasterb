/**
 * POST /api/benchmark/reservations
 *
 * Buat reservasi baru + fetch data lengkap (invoice-ready).
 * Wrapper dari: createReservation() di fo/reservations/actions.ts
 * Setara dengan: POST /api/v1/guests/bookings (Go backend)
 *
 * Body:
 *   hotel_id, guest_id, room_id,
 *   check_in_date (YYYY-MM-DD), check_out_date (YYYY-MM-DD),
 *   total_price, payment_status, payment_method?
 *
 * Response: { reservation_id, guest, room, hotel, total_price, payment_status }
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractToken, getSupabaseWithToken, unauthorized } from '../_lib/supabase';

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return unauthorized();

  try {
    const body = await req.json();
    const {
      hotel_id,
      guest_id,
      room_id,
      check_in_date,
      check_out_date,
      total_price,
      payment_status = 'pending',
      payment_method = null,
    } = body;

    if (!hotel_id || !guest_id || !room_id || !check_in_date || !check_out_date || !total_price) {
      return NextResponse.json(
        { error: 'hotel_id, guest_id, room_id, check_in_date, check_out_date, total_price wajib diisi' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseWithToken(token);

    // 1. Insert reservasi
    const { data: inserted, error: insertError } = await supabase
      .from('reservations')
      .insert({
        hotel_id,
        guest_id,
        room_id,
        check_in_date,
        check_out_date,
        total_price,
        payment_status,
        payment_method,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 2. Fetch data lengkap untuk response (setara Go's BookingCreateResult)
    const { data: full, error: fetchError } = await supabase
      .from('reservations')
      .select(`
        *,
        guest:guests(id, full_name, email, phone_number),
        room:rooms(id, room_number,
          room_type:room_types(id, name, price_per_night)
        ),
        hotel:hotels(name, address)
      `)
      .eq('id', inserted.id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Reservasi dibuat tapi gagal memuat data.' }, { status: 500 });
    }

    return NextResponse.json({ reservation: full }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
