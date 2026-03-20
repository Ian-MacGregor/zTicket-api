import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const comments = new Hono<AppEnv>();

const COMMENT_SELECT = `
  *,
  author:user_id ( id, email, full_name )
`;

// ─── LIST COMMENTS FOR A TICKET ────────────────────────────
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
  await sb.from("ticket_activity")
    .insert({ ticket_id: c.req.param("ticketId"), user_id: user.id, action: "added a comment" })
    .catch(() => {});
  return c.json(data, 201);
});

// ─── UPDATE OWN COMMENT (RLS enforces ownership) ───────────
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
