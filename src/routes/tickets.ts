import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const tickets = new Hono<AppEnv>();

const TICKET_SELECT = `
  *,
  assignee:assigned_to ( id, email, full_name ),
  reviewer:reviewer    ( id, email, full_name ),
  creator:created_by   ( id, email, full_name ),
  client:client_id     ( id, name ),
  files:ticket_files   ( id, file_name, file_path, file_size, mime_type, created_at )
`;

const TICKET_SELECT_NO_FILES = `
  *,
  assignee:assigned_to ( id, email, full_name ),
  reviewer:reviewer    ( id, email, full_name ),
  creator:created_by   ( id, email, full_name ),
  client:client_id     ( id, name )
`;

// ─── LIST ALL TICKETS ──────────────────────────────────────
tickets.get("/", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("tickets")
    .select(TICKET_SELECT)
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ─── GET SINGLE TICKET ─────────────────────────────────────
tickets.get("/:id", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("id", c.req.param("id"))
    .single();

  if (error) return c.json({ error: error.message }, 404);
  return c.json(data);
});

// ─── CREATE TICKET ──────────────────────────────────────────
tickets.post("/", async (c) => {
  const token = c.get("token") as string;
  const user = c.get("user") as { id: string };
  const sb = supabaseForUser(token);
  const body = await c.req.json();

  const { data, error } = await sb
    .from("tickets")
    .insert({
      title: body.title,
      description: body.description,
      priority: body.priority || "medium",
      status: body.status || "unassigned",
      assigned_to: body.assigned_to,
      reviewer: body.reviewer,
      client_id: body.client_id || null,
      gmail_links: body.gmail_links || [],
      quoted_time: body.quoted_time || null,
      quoted_price: body.quoted_price || null,
      quoted_amf: body.quoted_amf || null,
      comments: body.comments || null,
      created_by: user.id,
    })
    .select(TICKET_SELECT_NO_FILES)
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data, 201);
});

// ─── UPDATE TICKET ──────────────────────────────────────────
tickets.patch("/:id", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);
  const body = await c.req.json();

  const updateFields: Record<string, unknown> = {};
  const allowedFields = [
    "title",
    "description",
    "priority",
    "status",
    "assigned_to",
    "reviewer",
    "client_id",
    "gmail_links",
    "quoted_time",
    "quoted_price",
    "quoted_amf",
    "comments",
    "wait_hold_reason",
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) updateFields[field] = body[field];
  }

  const { data, error } = await sb
    .from("tickets")
    .update(updateFields)
    .eq("id", c.req.param("id"))
    .select(TICKET_SELECT)
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

// ─── DELETE TICKET ──────────────────────────────────────────
tickets.delete("/:id", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { error } = await sb
    .from("tickets")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true });
});

export default tickets;
