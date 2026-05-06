/**
 * PUT /api/benchmark/payment
 *
 * Update status pembayaran reservasi menjadi 'paid'.
 * Wrapper dari: processPaymentAction() di fo/billing/actions.ts
 * Setara dengan: POST /api/v1/guests/bookings/:id/pay (Go backend)
 *
 * Body: { reservation_id, amount, method }
 * Response: { success, message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractToken, getSupabaseWithToken, unauthorized } from '../_lib/supabase';

export async function PUT(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return unauthorized();

  try {
    const body = await req.json();
    const { reservation_id, amount, method } = body;

    if (!reservation_id || !amount || !method) {
      return NextResponse.json(
        { error: 'reservation_id, amount, dan method wajib diisi' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseWithToken(token);

    const { error } = await supabase
      .from('reservations')
      .update({ payment_status: 'paid', payment_method: method })
      .eq('id', reservation_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Pembayaran ${method} Rp ${Number(amount).toLocaleString('id-ID')} berhasil dicatat.`,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
