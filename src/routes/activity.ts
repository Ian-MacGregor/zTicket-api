import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const activity = new Hono<AppEnv>();

activity.get("/", async (c) => {
  const sb = supabaseForUser(c.get("token") as string);

  const { data, error } = await sb
    .from("ticket_activity")
    .select(`
      id, action, created_at,
      ticket:ticket_id ( ref_number ),
      actor:user_id ( full_name, email )
    `)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

export default activity;
