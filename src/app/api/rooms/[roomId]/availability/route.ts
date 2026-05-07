/**
 * GET /api/rooms/:roomId/availability?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD
 *
 * Cek ketersediaan satu kamar untuk rentang tanggal tertentu.
 * Header: Authorization: Bearer <token>
 *
 * Response 200: { available, room_id, room_number, room_type, price_per_night, check_in, check_out }
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  extractToken,
  getSupabaseWithToken,
  unauthorized,
} from '../../../benchmark/_lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const token = extractToken(req);
  if (!token) return unauthorized();

  const { searchParams } = new URL(req.url);
  const checkIn = searchParams.get('check_in');
  const checkOut = searchParams.get('check_out');

  if (!checkIn || !checkOut) {
    return NextResponse.json(
      { error: 'check_in dan check_out wajib diisi (format YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseWithToken(token);
    const { roomId } = await params;

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, room_number, status, hotel_id, room_type:room_types(id, name, price_per_night)')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room tidak ditemukan' }, { status: 404 });
    }

    if (room.status !== 'available') {
      return NextResponse.json({
        available: false,
        room_id: room.id,
        room_number: room.room_number,
        reason: `Room status: ${room.status}`,
      });
    }

    const { data: conflicts, error: conflictError } = await supabase
      .from('reservations')
      .select('id')
      .eq('room_id', roomId)
      .neq('payment_status', 'cancelled')
      .lt('check_in_date', checkOut)
      .gt('check_out_date', checkIn);

    if (conflictError) {
      return NextResponse.json({ error: conflictError.message }, { status: 500 });
    }

    const roomType = Array.isArray(room.room_type) ? room.room_type[0] : room.room_type;

    return NextResponse.json({
      available: conflicts.length === 0,
      room_id: room.id,
      room_number: room.room_number,
      room_type: roomType?.name ?? null,
      price_per_night: roomType?.price_per_night ?? 0,
      check_in: checkIn,
      check_out: checkOut,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
