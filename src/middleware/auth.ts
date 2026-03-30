/**
 * middleware/auth.ts
 *
 * Authentication middleware for all /api/* routes. Validates the Bearer JWT
 * supplied in the Authorization header by calling Supabase's getUser() with
 * the service-role client (which can verify tokens server-side without an
 * active user session).
 *
 * On success, the resolved User object and the raw token string are attached
 * to the Hono context so downstream route handlers can access them via
 * `c.get("user")` and `c.get("token")` respectively.
 *
 * On failure, a 401 JSON response is returned immediately and the request
 * chain is halted.
 */

import { Context, Next } from "hono";
import { supabaseAdmin } from "../db/supabase";

export async function authMiddleware(c: Context, next: Next) {
  // Reject requests that are missing or malformed Authorization headers.
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  // Strip the "Bearer " prefix to get the raw JWT.
  const token = authHeader.slice(7);

  // Verify the token with Supabase — resolves the user if valid, returns an
  // error if the token is expired, malformed, or otherwise invalid.
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Attach user and token to the context for downstream handlers.
  c.set("user", user);
  c.set("token", token);

  await next();
}
