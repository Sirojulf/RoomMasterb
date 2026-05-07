/**
 * POST /api/reservations/:reservationId/cancel
 *
 * Cancel sebuah reservasi (ubah payment_status menjadi 'cancelled').
 * Header: Authorization: Bearer <token>
 *
 * Response 200: { status: "cancelled", reservation_id }
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  extractToken,
  getSupabaseWithToken,
  unauthorized,
} from '../../../benchmark/_lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> }
) {
  const token = extractToken(req);
  if (!token) return unauthorized();

  try {
    const supabase = getSupabaseWithToken(token);
    const { reservationId } = await params;

    const { error } = await supabase
      .from('reservations')
      .update({ payment_status: 'cancelled' })
      .eq('id', reservationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'cancelled', reservation_id: reservationId });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
