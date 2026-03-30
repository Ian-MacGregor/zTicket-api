/**
 * routes/activity.ts
 *
 * Paginated audit log endpoint under /api/activity.
 * Returns rows from `ticket_activity`, which is written to by ticket mutations
 * (status changes, edits, comment posts) as a side-effect. Each row records
 * which user performed an action and on which ticket.
 *
 * The ticket and actor relations are joined so the client can display the
 * ticket reference number and the user's name without separate lookups.
 *
 * Endpoints:
 *   GET /   — paginated activity log, newest first
 *             Query params: page (default 1), limit (default 5, max 200)
 */

import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const activity = new Hono<AppEnv>();

// ─── LIST ACTIVITY (paginated, newest first) ────────────────
// Joins the related ticket (for ref_number + current status) and the actor
// profile (for display name). Limit is capped at 200 to prevent runaway
// queries. The exact count is returned alongside the data so the client can
// calculate total pages without a separate count request.
activity.get("/", async (c) => {
  const sb    = supabaseForUser(c.get("token") as string);
  const page  = Math.max(1, parseInt(c.req.query("page")  ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") ?? "5", 10)));
  const from  = (page - 1) * limit;

  const { data, error, count } = await sb
    .from("ticket_activity")
    .select(`
      id, ticket_id, action, created_at,
      ticket:ticket_id ( ref_number, status, assigned_to, reviewer ),
      actor:user_id ( full_name, email )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data: data ?? [], total: count ?? 0 });
});

export default activity;
