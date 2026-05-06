/**
 * POST /api/benchmark/guests
 *
 * Buat data tamu baru.
 * Wrapper dari: createGuestForReservation() di fo/reservations/actions.ts
 * Setara dengan: POST /api/v1/auth/guest/register (Go backend)
 *
 * Body: { hotel_id, title, full_name, email, phone_number? }
 * Response: { guest_id }
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractToken, getSupabaseWithToken, unauthorized } from '../_lib/supabase';

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return unauthorized();

  try {
    const body = await req.json();
    const { hotel_id, title, full_name, email, phone_number } = body;

    if (!hotel_id || !full_name || !email) {
      return NextResponse.json(
        { error: 'hotel_id, full_name, dan email wajib diisi' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseWithToken(token);

    const { data, error } = await supabase
      .from('guests')
      .insert({ hotel_id, title: title ?? 'Mr', full_name, email, phone_number })
      .select('id')
      .single();

    if (error) {
      const status = error.code === '23505' ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ guest_id: data.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
