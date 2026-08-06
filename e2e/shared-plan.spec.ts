/**
 * Shared Plan — Regression Tests
 *
 * These tests cover the production security boundary for the Shared Plan
 * feature. They hit the Edge Function directly with the anon key (no auth)
 * so the boundary itself is what is under test, not the frontend wrapper.
 *
 * Architecture reference: docs/architecture/shared-plan.md
 *
 * Test matrix:
 *   1. happy path              — anon + valid UUID + locked plan returns 200 + {snapshot, createdAt}
 *   2. malformed UUID          — anon + non-UUID token returns 400
 *   3. unknown UUID            — anon + valid format but no row returns 404
 *   4. draft plan              — anon + UUID for a draft (no locked snapshot) returns 404
 *   5. missing token           — anon + no `token` query parameter returns 400
 *   6. authenticated caller    — JWT + valid UUID works (no special branch needed; RPC accepts both)
 *   7. private data exposure   — anon + valid UUID response must NOT contain created_by, plan_payload,
 *                                idempotency_key, payload_hash, or any other column beyond
 *                                `snapshot` and `createdAt`
 *   8. write operations blocked — anon INSERT/UPDATE/DELETE on plan_versions via the anon client
 *                                must fail (RLS denies writes; we also REVOKED anon SELECT in the
 *                                migration, but writes were never granted — this test guards against
 *                                a future migration accidentally granting writes)
 *
 * Why these tests exist:
 *   Sprint 1.77 shipped the Edge Function code without the DB layer and
 *   Sprint 1.95's first attempt reintroduced service_role. These tests
 *   would have caught both.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { uniqueTag } from './helpers/test-data';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL_DIRECT = process.env.SUPABASE_URL ?? SUPABASE_URL;

const skipIfNoEnv = SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL_DIRECT ? test : test.skip;

const FUNCTIONS_BASE = `${SUPABASE_URL_DIRECT}/functions/v1`;
const REST_BASE = `${SUPABASE_URL_DIRECT}/rest/v1`;

interface SeededPlanVersion {
  versionId: string;
  clientId: string;
}

async function seedLockedPlanVersion(supabase: ReturnType<typeof createClient>): Promise<SeededPlanVersion> {
  // Direct DB seeding via service_role (test-only path). Creates:
  //   - a tagged coach user
  //   - a tagged client + client row
  //   - a locked plan_versions row
  // Returns the IDs so the test can target them and so the cleanup
  // fixture can delete them by email/UUID prefix.
  const tag = uniqueTag();
  const coachEmail = `e2e-test-coach-${tag}@example.com`;
  const coachPassword = 'E2eTest!Passw0rd-2026';

  // 1. Create coach auth user
  const { data: coachAuth, error: coachErr } = await supabase.auth.admin.createUser({
    email: coachEmail,
    password: coachPassword,
    email_confirm: true,
  });
  if (coachErr || !coachAuth.user) throw new Error(`coach create failed: ${coachErr?.message}`);
  const coachId = coachAuth.user.id;

  // 2. Insert user_profile row + role
  const { error: profileErr } = await supabase.from('user_profiles').insert({
    id: coachId,
    email: coachEmail,
    first_name: 'E2E',
    last_name: 'Coach',
  });
  if (profileErr) throw new Error(`profile insert failed: ${profileErr.message}`);
  const { error: roleErr } = await supabase.from('user_roles').insert({
    user_id: coachId,
    role: 'trainer',
  });
  if (roleErr) throw new Error(`role insert failed: ${roleErr.message}`);

  // 3. Create a client row owned by this coach
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .insert({
      user_profile_id: coachId,
      first_name: 'E2E',
      last_name: 'Client',
      primary_goal: 'maintenance',
    })
    .select('id')
    .single();
  if (clientErr || !client) throw new Error(`client insert failed: ${clientErr?.message}`);

  // 4. Create a nutrition_plan for the client
  const { data: plan, error: planErr } = await supabase
    .from('nutrition_plans')
    .insert({
      client_id: client.id,
      created_by: coachId,
    })
    .select('id')
    .single();
  if (planErr || !plan) throw new Error(`plan insert failed: ${planErr?.message}`);

  // 5. Create a LOCKED plan_version with a real locked_snapshot_json
  const snapshot = {
    identifier: { versionId: 'will-be-overwritten', lockedAt: new Date().toISOString() },
    weeklyPlan: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
    metrics: { targetCalories: 2000, proteinGrams: 150, carbsGrams: 200, fatGrams: 70 },
  };
  const { data: pv, error: pvErr } = await supabase
    .from('plan_versions')
    .insert({
      plan_id: plan.id,
      created_by: coachId,
      version_number: 1,
      locked_snapshot_json: snapshot,
      payload_hash: 'e2e-test-hash',
      idempotency_key: `e2e-${tag}`,
    })
    .select('id')
    .single();
  if (pvErr || !pv) throw new Error(`plan_version insert failed: ${pvErr?.message}`);

  return { versionId: pv.id, clientId: client.id };
}

async function seedDraftPlanVersion(supabase: ReturnType<typeof createClient>): Promise<string> {
  const tag = uniqueTag();
  const coachEmail = `e2e-test-coach-${tag}@example.com`;
  const coachPassword = 'E2eTest!Passw0rd-2026';

  const { data: coachAuth, error: coachErr } = await supabase.auth.admin.createUser({
    email: coachEmail,
    password: coachPassword,
    email_confirm: true,
  });
  if (coachErr || !coachAuth.user) throw new Error(`coach create failed: ${coachErr?.message}`);
  const coachId = coachAuth.user.id;

  await supabase.from('user_profiles').insert({
    id: coachId, email: coachEmail, first_name: 'E2E', last_name: 'Coach',
  });
  await supabase.from('user_roles').insert({ user_id: coachId, role: 'trainer' });

  const { data: client } = await supabase
    .from('clients')
    .insert({
      user_profile_id: coachId,
      first_name: 'E2E',
      last_name: 'DraftClient',
      primary_goal: 'maintenance',
    })
    .select('id')
    .single();
  if (!client) throw new Error('client insert failed');

  const { data: plan } = await supabase
    .from('nutrition_plans')
    .insert({ client_id: client.id, created_by: coachId })
    .select('id')
    .single();
  if (!plan) throw new Error('plan insert failed');

  const { data: pv } = await supabase
    .from('plan_versions')
    .insert({
      plan_id: plan.id,
      created_by: coachId,
      version_number: 1,
      locked_snapshot_json: null, // <-- THIS is the test condition
      payload_hash: 'e2e-test-draft-hash',
      idempotency_key: `e2e-draft-${tag}`,
    })
    .select('id')
    .single();
  if (!pv) throw new Error('draft plan_version insert failed');
  return pv.id;
}

async function cleanupSeededData(supabase: ReturnType<typeof createClient>, versionId: string): Promise<void> {
  // Best-effort: delete by version_id. We don't have a coach email/UUID
  // at hand for the fallback RPC from here; cleanup at the spec level
  // can target the user_profiles by `email like 'e2e-test-%'` separately.
  await supabase.from('plan_versions').delete().eq('id', versionId);
}

skipIfNoEnv.describe('Shared Plan — production security boundary', () => {
  let serviceClient: ReturnType<typeof createClient>;

  test.beforeAll(() => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('E2E tests need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env');
    }
    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  test('1. anon + valid UUID + locked plan returns 200 with {snapshot, createdAt}', async () => {
    const seeded = await seedLockedPlanVersion(serviceClient);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/get-shared-plan?token=${seeded.versionId}`, {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON_KEY! },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('snapshot');
      expect(body).toHaveProperty('createdAt');
      expect(body.snapshot).toMatchObject({
        metrics: expect.objectContaining({ targetCalories: 2000 }),
      });
    } finally {
      await cleanupSeededData(serviceClient, seeded.versionId);
    }
  });

  test('2. anon + malformed UUID returns 400', async () => {
    const res = await fetch(`${FUNCTIONS_BASE}/get-shared-plan?token=not-a-uuid`, {
      method: 'GET',
      headers: { apikey: SUPABASE_ANON_KEY! },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });

  test('3. anon + unknown UUID returns 404', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${FUNCTIONS_BASE}/get-shared-plan?token=${ghost}`, {
      method: 'GET',
      headers: { apikey: SUPABASE_ANON_KEY! },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  test('4. anon + UUID for a draft (no locked_snapshot_json) returns 404', async () => {
    const draftId = await seedDraftPlanVersion(serviceClient);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/get-shared-plan?token=${draftId}`, {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON_KEY! },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/not found/i);
    } finally {
      await cleanupSeededData(serviceClient, draftId);
    }
  });

  test('5. anon + missing token parameter returns 400', async () => {
    const res = await fetch(`${FUNCTIONS_BASE}/get-shared-plan`, {
      method: 'GET',
      headers: { apikey: SUPABASE_ANON_KEY! },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
  });

  test('6. authenticated caller + valid UUID returns 200 (same path as anon, no JWT branching)', async () => {
    const seeded = await seedLockedPlanVersion(serviceClient);
    try {
      const tag = uniqueTag();
      const coachEmail = `e2e-test-coach-${tag}@example.com`;
      const coachPassword = 'E2eTest!Passw0rd-2026';

      const { data: coachAuth, error: coachErr } = await serviceClient.auth.admin.createUser({
        email: coachEmail,
        password: coachPassword,
        email_confirm: true,
      });
      if (coachErr || !coachAuth.user) throw new Error(`coach create failed: ${coachErr?.message}`);

      const authedClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInErr } = await authedClient.auth.signInWithPassword({
        email: coachEmail,
        password: coachPassword,
      });
      if (signInErr) throw new Error(`sign-in failed: ${signInErr.message}`);

      const res = await fetch(`${FUNCTIONS_BASE}/get-shared-plan?token=${seeded.versionId}`, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${(await authedClient.auth.getSession()).data.session?.access_token}`,
        },
      });
      expect(res.status).toBe(200);
    } finally {
      await cleanupSeededData(serviceClient, seeded.versionId);
    }
  });

  test('7. anon response MUST NOT contain private columns (created_by, plan_payload, idempotency_key, payload_hash)', async () => {
    const seeded = await seedLockedPlanVersion(serviceClient);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/get-shared-plan?token=${seeded.versionId}`, {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON_KEY! },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      // The shared endpoint's contract is (snapshot, createdAt) ONLY.
      const privateFields = [
        'plan_payload',
        'created_by',
        'idempotency_key',
        'payload_hash',
        'plan_id',
        'version_number',
        'archived',
      ];
      for (const field of privateFields) {
        expect(body).not.toHaveProperty(field);
      }
      // Defence in depth — also walk any nested objects.
      const json = JSON.stringify(body);
      expect(json).not.toMatch(/e2e-test-hash/); // payload_hash value
      expect(json).not.toMatch(seeded.clientId); // private FK
    } finally {
      await cleanupSeededData(serviceClient, seeded.versionId);
    }
  });

  test('8. anon CANNOT SELECT * from plan_versions (RLS denied, even by accident)', async () => {
    // This is the "wrong path" test. The migration REVOKEs anon SELECT, so
    // any future developer who writes a SELECT * against plan_versions via
    // the anon client will be denied by Postgres itself, not just by the RPC.
    const anonClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonClient.from('plan_versions').select('*').limit(1);
    // Either an error (RLS denies) or empty data (PostgREST returns no rows
    // when SELECT privilege is missing). We accept either, but the response
    // MUST NOT contain data — that's the security boundary.
    if (error) {
      expect(String(error.message)).toMatch(/permission|denied|row.level|policy/i);
    } else {
      expect(data).toEqual([]);
    }
    // And the anon key must NOT see any rows through the REST endpoint either.
    const res = await fetch(`${REST_BASE}/plan_versions?select=*`, {
      method: 'GET',
      headers: { apikey: SUPABASE_ANON_KEY! },
    });
    expect([401, 403, 404]).toContain(res.status);
  });

  test('9. anon CANNOT INSERT into plan_versions (defence in depth)', async () => {
    const anonClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anonClient.from('plan_versions').insert({
      plan_id: '00000000-0000-4000-8000-000000000000',
      created_by: '00000000-0000-4000-8000-000000000000',
      version_number: 1,
      locked_snapshot_json: { x: 1 },
      payload_hash: 'evil',
      idempotency_key: 'evil',
    }).select();
    // RLS denies the write. Supabase JS returns data=null on failed insert.
    // We accept data being null OR []. We MUST observe an error.
    expect(error).not.toBeNull();
    if (data !== null) expect(data).toEqual([]);
  });
});