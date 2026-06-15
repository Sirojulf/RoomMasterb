/**
 * POST /api/reservations/:reservationId/pay
 *
 * Bayar sebuah reservasi: ubah payment_status ke 'paid' dan catat transaction.
 * Header: Authorization: Bearer <token>
 * Body: { payment_method?: 'cash' | 'transfer' | 'qris' | 'credit_card' | 'other' }
 *
 * Response 200: { reservation, transaction }
 * Response 401: token invalid / tidak ada
 * Response 404: reservation tidak ditemukan / bukan milik guest yang login
 * Response 422: sudah cancelled
 * Response 500: DB error
 *
 * Idempotent: kalau sudah paid, return reservation existing tanpa transaction baru.
 */
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  extractToken,
  getSupabaseWithToken,
  unauthorized,
} from '../../../benchmark/_lib/supabase';

type PaymentMethod = 'cash' | 'transfer' | 'qris' | 'credit_card' | 'other';

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'transfer',
  'qris',
  'credit_card',
  'other',
];

function mapPaymentMethod(input?: string): PaymentMethod {
  if (input && VALID_PAYMENT_METHODS.includes(input as PaymentMethod)) {
    return input as PaymentMethod;
  }
  return 'transfer';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> }
) {
  const token = extractToken(req);
  if (!token) return unauthorized();

  try {
    const { reservationId } = await params;

    let payment_method: PaymentMethod = 'transfer';
    try {
      const body = await req.json();
      payment_method = mapPaymentMethod(body?.payment_method);
    } catch {
      // Empty / non-JSON body — default to 'transfer'
    }

    const supabase = getSupabaseWithToken(token);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Token tidak valid' }, { status: 401 });
    }

    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('id, hotel_id, guest_id, total_price, payment_status, payment_method')
      .eq('id', reservationId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation tidak ditemukan' }, { status: 404 });
    }

    const { data: guest } = await supabase
      .from('guests')
      .select('id')
      .eq('hotel_id', reservation.hotel_id)
      .eq('email', user.email!)
      .maybeSingle();

    if (!guest || guest.id !== reservation.guest_id) {
      return NextResponse.json({ error: 'Reservation tidak ditemukan' }, { status: 404 });
    }

    if (reservation.payment_status === 'cancelled') {
      return NextResponse.json(
        { error: 'Reservasi sudah dibatalkan' },
        { status: 422 }
      );
    }

    if (reservation.payment_status === 'paid') {
      const { data: full } = await supabase
        .from('reservations')
        .select(`
          *,
          guest:guests(id, full_name, email),
          room:rooms(id, room_number, room_type:room_types(id, name, price_per_night)),
          hotel:hotels(name)
        `)
        .eq('id', reservationId)
        .single();

      return NextResponse.json({ reservation: full ?? reservation, transaction: null });
    }

    const { error: updateError } = await supabase
      .from('reservations')
      .update({ payment_status: 'paid', payment_method })
      .eq('id', reservationId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const transactionId = randomUUID();
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        id: transactionId,
        reservation_id: reservationId,
        description: 'Pembayaran reservasi',
        amount: reservation.total_price,
        type: 'payment',
      })
      .select('id, reservation_id, type, amount, created_at')
      .single();

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 });
    }

    const { data: full, error: refetchError } = await supabase
      .from('reservations')
      .select(`
        *,
        guest:guests(id, full_name, email),
        room:rooms(id, room_number, room_type:room_types(id, name, price_per_night)),
        hotel:hotels(name)
      `)
      .eq('id', reservationId)
      .single();

    if (refetchError) {
      return NextResponse.json({ error: refetchError.message }, { status: 500 });
    }

    return NextResponse.json({ reservation: full, transaction });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
