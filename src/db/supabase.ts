/**
 * db/supabase.ts
 *
 * Supabase client factory. Provides two client variants used throughout the
 * API:
 *
 *   supabaseAdmin     — service-role client, bypasses Row Level Security.
 *                       Used only in authMiddleware to validate JWTs. Must
 *                       never be passed user-supplied data directly.
 *
 *   supabaseForUser() — anon-key client with the user's JWT injected as the
 *                       Authorization header. Supabase evaluates RLS policies
 *                       using this token, so users can only read/write rows
 *                       they are permitted to access.
 *
 * Required environment variables:
 *   SUPABASE_URL               — project REST URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role secret (keep server-side only)
 *   SUPABASE_ANON_KEY          — public anon key
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Service-role client — bypasses RLS. Used only for token validation in authMiddleware. */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Returns a per-request Supabase client that forwards the user's access token
 * as the Authorization header, enabling RLS to enforce row-level permissions.
 * A new client instance is created for every request so tokens are never
 * shared across requests.
 */
export function supabaseForUser(accessToken: string) {
  return createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
