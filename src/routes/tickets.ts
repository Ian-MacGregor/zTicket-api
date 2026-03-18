import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const tickets = new Hono<AppEnv>();

// ─── LIST ALL TICKETS ──────────────────────────────────────
tickets.get("/", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("tickets")
    .select(
      `
      *,
      assignee:assigned_to ( id, email, full_name ),
      reviewer:reviewer    ( id, email, full_name ),
      creator:created_by   ( id, email, full_name ),
      files:ticket_files   ( id, file_name, file_path, file_size, mime_type, created_at )
    `
    )
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
    .select(
      `
      *,
      assignee:assigned_to ( id, email, full_name ),
      reviewer:reviewer    ( id, email, full_name ),
      creator:created_by   ( id, email, full_name ),
      files:ticket_files   ( id, file_name, file_path, file_size, mime_type, created_at )
    `
    )
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
      status: body.status || "assigned",
      assigned_to: body.assigned_to,
      reviewer: body.reviewer,
      gmail_links: body.gmail_links || [],
      created_by: user.id,
    })
    .select(
      `
      *,
      assignee:assigned_to ( id, email, full_name ),
      reviewer:reviewer    ( id, email, full_name ),
      creator:created_by   ( id, email, full_name )
    `
    )
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
    "gmail_links",
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) updateFields[field] = body[field];
  }

  const { data, error } = await sb
    .from("tickets")
    .update(updateFields)
    .eq("id", c.req.param("id"))
    .select(
      `
      *,
      assignee:assigned_to ( id, email, full_name ),
      reviewer:reviewer    ( id, email, full_name ),
      creator:created_by   ( id, email, full_name ),
      files:ticket_files   ( id, file_name, file_path, file_size, mime_type, created_at )
    `
    )
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
