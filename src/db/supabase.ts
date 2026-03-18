import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service-role client — bypasses RLS (used for admin operations)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Create a per-request client that respects RLS using the user's JWT
export function supabaseForUser(accessToken: string) {
  return createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
