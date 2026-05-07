/**
 * Seed data untuk benchmark k6 — RoomMasterb
 *
 * Cara pakai:
 *   1. Pastikan .env.local berisi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY
 *   2. Jalankan: node scripts/seed-benchmark.mjs
 *
 * Script ini membuat:
 *   - 1 hotel test (ID tetap)
 *   - 2 room type (Standard, Deluxe)
 *   - 5 rooms (ID tetap, siap dipakai di k6 config)
 *   - 1 auth user  : k6test@roommaster.test / K6testPassword123!
 *   - 1 profile + Front Office role assignment
 *   - 1 guest record (untuk reservasi)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ─── Load env ────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) {
    console.error('❌  .env.local tidak ditemukan di root project.');
    process.exit(1);
  }
  const raw = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Fixed IDs (agar reproducible & bisa di-hardcode di k6 config) ──────────

const HOTEL_ID       = 'a0000000-0000-0000-0000-000000000001';
const RT_STANDARD_ID = 'a1000000-0000-0000-0000-000000000001';
const RT_DELUXE_ID   = 'a1000000-0000-0000-0000-000000000002';

const ROOM_IDS = [
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000005',
];

const TEST_EMAIL    = 'k6test@roommaster.test';
const TEST_PASSWORD = 'K6testPassword123!';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(label)  { console.log(`  ✅ ${label}`); }
function skip(label){ console.log(`  ⏭  ${label} (sudah ada)`); }
function fail(label, msg) { console.error(`  ❌ ${label}: ${msg}`); }

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedHotel() {
  const { error } = await supabase.from('hotels').upsert(
    { id: HOTEL_ID, name: 'Hotel Benchmark Test', address: 'Jl. Benchmark No. 1', status: 'active', code: 'BENCH' },
    { onConflict: 'id' }
  );
  error ? fail('Hotel', error.message) : ok('Hotel "Hotel Benchmark Test"');
}

async function seedRoomTypes() {
  const { error } = await supabase.from('room_types').upsert(
    [
      { id: RT_STANDARD_ID, hotel_id: HOTEL_ID, name: 'Standard', price_per_night: 350000, capacity: 2, bed_type: 'Double' },
      { id: RT_DELUXE_ID,   hotel_id: HOTEL_ID, name: 'Deluxe',   price_per_night: 550000, capacity: 2, bed_type: 'Queen'  },
    ],
    { onConflict: 'id' }
  );
  error ? fail('Room types', error.message) : ok('2 room types (Standard Rp350k, Deluxe Rp550k)');
}

async function seedRooms() {
  const rooms = [
    { id: ROOM_IDS[0], hotel_id: HOTEL_ID, room_type_id: RT_STANDARD_ID, room_number: '101', status: 'available', floor_number: 1 },
    { id: ROOM_IDS[1], hotel_id: HOTEL_ID, room_type_id: RT_STANDARD_ID, room_number: '102', status: 'available', floor_number: 1 },
    { id: ROOM_IDS[2], hotel_id: HOTEL_ID, room_type_id: RT_STANDARD_ID, room_number: '103', status: 'available', floor_number: 1 },
    { id: ROOM_IDS[3], hotel_id: HOTEL_ID, room_type_id: RT_DELUXE_ID,   room_number: '201', status: 'available', floor_number: 2 },
    { id: ROOM_IDS[4], hotel_id: HOTEL_ID, room_type_id: RT_DELUXE_ID,   room_number: '202', status: 'available', floor_number: 2 },
  ];
  const { error } = await supabase.from('rooms').upsert(rooms, { onConflict: 'id' });
  error ? fail('Rooms', error.message) : ok('5 rooms (101,102,103,201,202)');
}

async function seedAuthUser() {
  // Check if already exists
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users?.find(u => u.email === TEST_EMAIL);

  if (existing) {
    skip(`Auth user ${TEST_EMAIL}`);
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'K6 Test User' },
  });

  if (error || !data.user) {
    fail('Auth user', error?.message ?? 'unknown');
    process.exit(1);
  }

  ok(`Auth user ${TEST_EMAIL} (id: ${data.user.id})`);
  return data.user.id;
}

async function seedProfile(userId) {
  const { error } = await supabase.from('profiles').upsert(
    { id: userId, email: TEST_EMAIL, full_name: 'K6 Test User', role: 'Front Office', hotel_id: HOTEL_ID },
    { onConflict: 'id' }
  );
  error ? fail('Profile', error.message) : ok('Profile (Front Office)');
}

async function seedRoleAssignment(userId) {
  const { data: foRole } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'Front Office')
    .single();

  if (!foRole) {
    fail('Role assignment', 'Role "Front Office" tidak ditemukan di tabel roles');
    return;
  }

  // Check if already assigned
  const { data: existing } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role_id', foRole.id)
    .eq('hotel_id', HOTEL_ID)
    .maybeSingle();

  if (existing) {
    skip('Role assignment Front Office');
    return;
  }

  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role_id: foRole.id, hotel_id: HOTEL_ID });

  error ? fail('Role assignment', error.message) : ok('Role "Front Office" di-assign ke user');
}

async function seedGuest() {
  const { data: existing } = await supabase
    .from('guests')
    .select('id')
    .eq('hotel_id', HOTEL_ID)
    .eq('email', TEST_EMAIL)
    .maybeSingle();

  if (existing) {
    skip(`Guest ${TEST_EMAIL}`);
    return;
  }

  const { error } = await supabase.from('guests').insert({
    hotel_id: HOTEL_ID,
    full_name: 'K6 Test User',
    email: TEST_EMAIL,
    phone_number: '08123456789',
    title: 'Mr.',
  });

  error ? fail('Guest', error.message) : ok(`Guest record untuk ${TEST_EMAIL}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱  Seeding benchmark data untuk RoomMasterb...\n');

  await seedHotel();
  await seedRoomTypes();
  await seedRooms();

  const userId = await seedAuthUser();
  await seedProfile(userId);
  await seedRoleAssignment(userId);
  await seedGuest();

  console.log('\n' + '═'.repeat(62));
  console.log('📋  INFO UNTUK k6 CONFIG (config.js)');
  console.log('═'.repeat(62));
  console.log(`  Port server          : 3000`);
  console.log(`  Base URL API         : http://localhost:3000/api`);
  console.log(`  Email test           : ${TEST_EMAIL}`);
  console.log(`  Password test        : ${TEST_PASSWORD}`);
  console.log(`  Room IDs (5 buah)    :`);
  ROOM_IDS.forEach((id, i) => console.log(`    [${i}] ${id}`));
  console.log(`  Endpoint login       : /auth/login`);
  console.log(`  Field token login    : access_token`);
  console.log(`  Endpoint reservasi   : /reservations`);
  console.log(`  Field ID reservasi   : reservation.id`);
  console.log(`  Endpoint cancel      : /reservations/:id/cancel`);
  console.log('═'.repeat(62) + '\n');
}

seed().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
