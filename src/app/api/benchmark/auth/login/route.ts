/**
 * POST /api/benchmark/auth/login
 *
 * Login tamu dan kembalikan access_token Supabase.
 * Setara dengan: POST /api/v1/auth/guest/login (Go backend)
 *
 * Body: { email: string, password: string }
 * Response: { access_token, user_id }
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'email dan password wajib diisi' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return NextResponse.json({ error: error?.message ?? 'Login gagal' }, { status: 401 });
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      user_id: data.user.id,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
