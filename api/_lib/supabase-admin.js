/**
 * Supabase admin client — service role, server-side only.
 *
 * Wraps `@supabase/supabase-js` createClient with a singleton + env-var
 * validation. Never expose this client to the browser — it bypasses RLS.
 *
 * Lift-ready: no domain references. Copy this file 1-on-1 to another project
 * that needs Supabase service-role access.
 *
 * Last reviewed: 2026-05-11 (1AM-177)
 */

import { createClient } from '@supabase/supabase-js';

let cached;

/**
 * Lazy singleton — only instantiate the client on first use, not at module load.
 * Vercel serverless functions cold-start often; a module-level client would
 * fail with an unhelpful error if env vars are missing.
 */
export function getSupabaseAdmin() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('supabase-admin: SUPABASE_URL env var is not set');
  }
  if (!key) {
    throw new Error('supabase-admin: SUPABASE_SERVICE_ROLE_KEY env var is not set');
  }

  cached = createClient(url, key, {
    auth: {
      // Service role doesn't use session-based auth — disable to avoid
      // unnecessary token refresh cycles in short-lived function invocations
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}
