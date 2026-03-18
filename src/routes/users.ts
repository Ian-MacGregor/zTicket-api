import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const users = new Hono<AppEnv>();

// ─── LIST ALL PROFILES ─────────────────────────────────────
users.get("/", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .order("full_name");

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ─── GET CURRENT USER PROFILE ──────────────────────────────
users.get("/me", async (c) => {
  const token = c.get("token") as string;
  const user = c.get("user") as { id: string };
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

export default users;
