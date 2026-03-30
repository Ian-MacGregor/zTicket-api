/**
 * routes/colors.ts
 *
 * Per-user color theme settings routes under /api/colors.
 * Each user has at most one row in `color_settings` (keyed on user ID).
 * The settings column stores a JSON object of color key→value pairs that the
 * frontend applies as CSS custom properties via the ColorProvider.
 *
 * Endpoints:
 *   GET   /   — fetch the calling user's color settings (returns empty settings if none saved yet)
 *   PATCH /   — save / overwrite the calling user's color settings (upsert)
 */

import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const colors = new Hono<AppEnv>();

// ─── GET COLOR SETTINGS ────────────────────────────────────
// Uses maybeSingle() so a missing row returns null rather than an error.
// When no row exists yet, an empty settings object is returned so the
// frontend falls back to its built-in defaults without error handling.
colors.get("/", async (c) => {
  const token = c.get("token") as string;
  const user = c.get("user") as { id: string };
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("color_settings")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 500);
  // Return a stub with empty settings when no row exists yet so the client
  // always receives a consistent shape.
  return c.json(data || { id: user.id, settings: {} });
});

// ─── UPDATE COLOR SETTINGS ─────────────────────────────────
// Upserts the full settings object — the client always sends the complete
// current theme, so partial updates are not needed. updated_at is set
// server-side to record when the settings were last changed.
colors.patch("/", async (c) => {
  const token = c.get("token") as string;
  const user = c.get("user") as { id: string };
  const sb = supabaseForUser(token);
  const body = await c.req.json();

  const { data, error } = await sb
    .from("color_settings")
    .upsert({
      id: user.id,
      settings: body.settings,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

export default colors;
