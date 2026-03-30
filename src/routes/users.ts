/**
 * routes/users.ts
 *
 * User profile routes under /api/users.
 * Profiles are rows in the `profiles` table that mirror Supabase Auth users.
 * The list endpoint is used to populate assignee/reviewer dropdowns throughout
 * the app. The /me endpoints allow the calling user to read and update their
 * own profile (display name, linked Gmail account).
 *
 * Endpoints:
 *   GET   /      — list all user profiles (id, email, full_name, avatar_url)
 *   GET   /me    — get the calling user's full profile
 *   PATCH /me    — update the calling user's profile (full_name, gmail_account)
 */

import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const users = new Hono<AppEnv>();

// ─── LIST ALL PROFILES ─────────────────────────────────────
// Returns a minimal projection sorted by full_name. Used to populate
// assignee and reviewer dropdowns in the ticket form and dashboard modals.
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
// Returns the full profile row for the authenticated user, including
// settings fields like gmail_account. Used by SettingsPage on load.
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

// ─── UPDATE CURRENT USER PROFILE ───────────────────────────
// Only allows updating a whitelist of fields (full_name, gmail_account) so
// callers cannot overwrite protected columns. Returns 400 if the request body
// contains no recognised fields. Users can only update their own profile
// because the query is scoped to user.id.
users.patch("/me", async (c) => {
  const token = c.get("token") as string;
  const user  = c.get("user") as { id: string };
  const sb    = supabaseForUser(token);
  const body  = await c.req.json();

  const allowed = ["full_name", "gmail_account"];
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (field in body) updates[field] = body[field];
  }

  if (!Object.keys(updates).length) return c.json({ error: "No valid fields to update." }, 400);

  const { data, error } = await sb
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

export default users;
