/**
 * GET /api/benchmark/availability?hotel_id=X&start_date=Y&end_date=Z
 *
 * Cek ketersediaan kamar dalam rentang tanggal.
 * Wrapper dari: getAvailabilityData() di fo/availability/actions.ts
 * Setara dengan: GET /api/v1/rooms/:id/availability (Go backend)
 *
 * Response: { rooms: Room[], reservations: Reservation[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractToken, getSupabaseWithToken, unauthorized } from '../_lib/supabase';

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return unauthorized();

  const { searchParams } = new URL(req.url);
  const hotelId   = searchParams.get('hotel_id');
  const startDate = searchParams.get('start_date');
  const endDate   = searchParams.get('end_date');

  if (!hotelId || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'hotel_id, start_date, dan end_date wajib diisi' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseWithToken(token);

    const [roomsRes, reservationsRes] = await Promise.all([
      supabase
        .from('rooms')
        .select('*, room_type:room_types(*)')
        .eq('hotel_id', hotelId)
        .order('room_number', { ascending: true }),

      supabase
        .from('reservations')
        .select('*, guest:guests(id, full_name, email)')
        .eq('hotel_id', hotelId)
        .neq('payment_status', 'cancelled')
        .lt('check_in_date', endDate)
        .gt('check_out_date', startDate),
    ]);

    if (roomsRes.error) {
      return NextResponse.json({ error: roomsRes.error.message }, { status: 500 });
    }
    if (reservationsRes.error) {
      return NextResponse.json({ error: reservationsRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      rooms: roomsRes.data,
      reservations: reservationsRes.data,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
