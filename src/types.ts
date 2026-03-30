/**
 * types.ts
 *
 * Shared TypeScript types for the API layer. Centralising them here avoids
 * circular imports and keeps route files from importing directly from each
 * other.
 */

import type { User } from "@supabase/supabase-js";

/**
 * Hono environment type for the app.
 * Typed context variables set by authMiddleware and available in all
 * /api/* route handlers via `c.get("user")` and `c.get("token")`.
 */
export type AppEnv = {
  Variables: {
    /** The authenticated Supabase user object resolved from the Bearer JWT. */
    user: User;
    /** The raw Bearer token string, used to create per-request Supabase clients. */
    token: string;
  };
};
