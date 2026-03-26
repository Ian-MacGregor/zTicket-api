import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const activity = new Hono<AppEnv>();

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
