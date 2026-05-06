// Helper untuk REST API benchmark endpoints.
// Menggunakan Bearer token dari Authorization header, bukan cookie session.
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export function getSupabaseWithToken(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    }
  );
}

export function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

export function unauthorized() {
  return NextResponse.json({ error: 'Authorization header wajib ada (Bearer token)' }, { status: 401 });
}
