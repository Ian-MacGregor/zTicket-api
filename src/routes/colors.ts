import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const colors = new Hono<AppEnv>();

// ─── GET COLOR SETTINGS ────────────────────────────────────
colors.get("/", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("color_settings")
    .select("*")
    .eq("id", "global")
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ─── UPDATE COLOR SETTINGS ─────────────────────────────────
colors.patch("/", async (c) => {
  const token = c.get("token") as string;
  const user = c.get("user") as { id: string };
  const sb = supabaseForUser(token);
  const body = await c.req.json();

  const { data, error } = await sb
    .from("color_settings")
    .update({
      settings: body.settings,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "global")
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

export default colors;
