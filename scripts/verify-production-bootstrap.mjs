import { readFileSync, existsSync } from 'node:fs';

const checks = [
  {
    file: 'vercel.json',
    patterns: ['"source": "/(.*)"', '"destination": "/index.html"'],
  },
  {
    file: 'supabase/migrations/20251120110128_8df2ce8c-85a8-4e93-b31d-9d731f883512.sql',
    patterns: [
      'CREATE TABLE public.plan_versions',
      'ALTER TABLE public.nutrition_plans\nADD COLUMN current_version_id',
      'CREATE TABLE public.plan_overrides',
      'CREATE TABLE public.client_progress_snapshots',
      'CREATE TABLE public.macro_tolerance_rules',
    ],
  },
  {
    file: 'supabase/migrations/20260530120000_p0_ownership_bootstrap_client_linking.sql',
    patterns: [
      // Phase 12: the bootstrap trigger derives the initial role from signup
      // metadata with a safe default ('coach'), assigned via the v_role
      // variable and inserted WITHOUT a hardcoded role literal. The hardcoded
      // 'trainer' role is validated separately in 20260720000000 (below).
      'v_role app_role;',
      "(NEW.raw_user_meta_data->>'role')::app_role",
      "VALUES (NEW.id, v_role, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))",
      'VALUES (NEW.id, v_role)',
      'CREATE TABLE IF NOT EXISTS public.client_invitations',
      'CREATE OR REPLACE FUNCTION public.create_client_invitation',
      'CREATE OR REPLACE FUNCTION public.claim_client_invitation',
      'c.created_by = v_user_id',
      'client_visible_locked_plan_versions',
    ],
  },
  {
    file: 'supabase/migrations/20260720000000_fix_handle_new_user_trainer_role.sql',
    patterns: [
      // Production fix codified into history: the CURRENT intended end state
      // of handle_new_user hardcodes the self-serve signup role 'trainer' in
      // BOTH the profiles insert and the user_roles insert. This is the
      // relationship the bootstrap verification must guarantee: the bootstrap
      // migration owns the metadata-derived pattern, the fix migration owns
      // the final hardcoded trainer-role state.
      'CREATE OR REPLACE FUNCTION public.handle_new_user()',
      "VALUES (NEW.id, 'trainer'::app_role, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))",
      "VALUES (NEW.id, 'trainer'::app_role)",
    ],
  },
];

const failures = [];

for (const check of checks) {
  if (!existsSync(check.file)) {
    failures.push(`${check.file}: missing file`);
    continue;
  }

  const contents = readFileSync(check.file, 'utf8');
  for (const pattern of check.patterns) {
    if (!contents.includes(pattern)) {
      failures.push(`${check.file}: missing pattern ${JSON.stringify(pattern)}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Production bootstrap verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('✅ Production bootstrap static verification passed');
