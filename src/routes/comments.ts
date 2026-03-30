/**
 * routes/comments.ts
 *
 * Comment thread routes nested under /api/tickets/:ticketId/comments.
 * Each comment belongs to a ticket and is authored by the calling user.
 * Users may only edit their own comments — ownership is enforced by Supabase
 * Row Level Security on the ticket_comments table.
 *
 * Endpoints:
 *   GET   /:ticketId/comments               — list all comments (oldest first)
 *   POST  /:ticketId/comments               — add a comment + log activity
 *   PATCH /:ticketId/comments/:commentId    — edit own comment body
 */

import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const comments = new Hono<AppEnv>();

/** Select expression that joins the author's profile onto every comment row. */
const COMMENT_SELECT = `
  *,
  author:user_id ( id, email, full_name )
`;

// ─── LIST COMMENTS FOR A TICKET ────────────────────────────
// Returns comments in chronological order (oldest first) so the thread reads
// top-to-bottom in the UI.
comments.get("/:ticketId/comments", async (c) => {
  const sb = supabaseForUser(c.get("token") as string);

  const { data, error } = await sb
    .from("ticket_comments")
    .select(COMMENT_SELECT)
    .eq("ticket_id", c.req.param("ticketId"))
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

// ─── CREATE COMMENT ─────────────────────────────────────────
// Validates that the body is non-empty, inserts the comment, then writes an
// "added a comment" entry to ticket_activity. The activity insert is
// fire-and-forget (errors are swallowed) so a logging failure never blocks
// the response.
comments.post("/:ticketId/comments", async (c) => {
  const sb   = supabaseForUser(c.get("token") as string);
  const user = c.get("user") as { id: string };
  const { body } = await c.req.json();

  if (!body?.trim()) return c.json({ error: "Comment body is required." }, 400);

  const { data, error } = await sb
    .from("ticket_comments")
    .insert({ ticket_id: c.req.param("ticketId"), user_id: user.id, body: body.trim() })
    .select(COMMENT_SELECT)
    .single();

  if (error) return c.json({ error: error.message }, 400);
  try {
    await sb.from("ticket_activity")
      .insert({ ticket_id: c.req.param("ticketId"), user_id: user.id, action: "added a comment" });
  } catch {}
  return c.json(data, 201);
});

// ─── UPDATE OWN COMMENT (RLS enforces ownership) ───────────
// Only the body field is updatable. The `updated_at` timestamp is managed by
// a database trigger. RLS prevents users from editing comments they did not
// author — the update will silently affect 0 rows if the caller does not own
// the comment, which Supabase surfaces as an error.
comments.patch("/:ticketId/comments/:commentId", async (c) => {
  const sb = supabaseForUser(c.get("token") as string);
  const { body } = await c.req.json();

  if (!body?.trim()) return c.json({ error: "Comment body is required." }, 400);

  const { data, error } = await sb
    .from("ticket_comments")
    .update({ body: body.trim() })
    .eq("id", c.req.param("commentId"))
    .select(COMMENT_SELECT)
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

export default comments;
