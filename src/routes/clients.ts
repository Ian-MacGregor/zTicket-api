/**
 * routes/clients.ts
 *
 * Client and contact management routes under /api/clients.
 * Clients are organisations that tickets can be associated with. Each client
 * can have multiple contacts (people at that organisation), stored in the
 * `client_contacts` table.
 *
 * Endpoints:
 *   GET    /                             — list all clients with their contacts
 *   GET    /:id                          — get a single client with contacts
 *   POST   /                             — create a client
 *   PATCH  /:id                          — rename a client
 *   DELETE /:id                          — delete a client (cascades to contacts)
 *   POST   /:id/contacts                 — add a contact to a client
 *   PATCH  /:id/contacts/:contactId      — update a contact (field whitelist)
 *   DELETE /:id/contacts/:contactId      — delete a contact
 */

import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const clients = new Hono<AppEnv>();

// ─── LIST ALL CLIENTS (with contacts) ──────────────────────
// Eagerly joins contacts so the ClientsPage can render the full hierarchy in
// a single request. Ordered alphabetically by client name.
clients.get("/", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("clients")
    .select(`
      *,
      contacts:client_contacts ( id, name, email, phone, phone2, role, distribute_code, created_at )
    `)
    .order("name");

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ─── GET SINGLE CLIENT ─────────────────────────────────────
// Returns the client row with its contacts. Returns 404 if not found.
clients.get("/:id", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("clients")
    .select(`
      *,
      contacts:client_contacts ( id, name, email, phone, phone2, role, distribute_code, created_at )
    `)
    .eq("id", c.req.param("id"))
    .single();

  if (error) return c.json({ error: error.message }, 404);
  return c.json(data);
});

// ─── CREATE CLIENT ──────────────────────────────────────────
clients.post("/", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);
  const body = await c.req.json();

  const { data, error } = await sb
    .from("clients")
    .insert({ name: body.name })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data, 201);
});

// ─── UPDATE CLIENT ──────────────────────────────────────────
// Currently only the name field is editable via this endpoint.
clients.patch("/:id", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);
  const body = await c.req.json();

  const { data, error } = await sb
    .from("clients")
    .update({ name: body.name })
    .eq("id", c.req.param("id"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

// ─── DELETE CLIENT ──────────────────────────────────────────
// Database foreign key constraints cascade the delete to client_contacts rows.
clients.delete("/:id", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { error } = await sb
    .from("clients")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true });
});

// ─── ADD CONTACT TO CLIENT ──────────────────────────────────
// Optional fields (email, phone, phone2, role) are coerced to null when
// absent so the DB stores null rather than an empty string.
clients.post("/:id/contacts", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);
  const body = await c.req.json();

  const { data, error } = await sb
    .from("client_contacts")
    .insert({
      client_id: c.req.param("id"),
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      phone2: body.phone2 || null,
      role: body.role || null,
      distribute_code: body.distribute_code ?? false,
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data, 201);
});

// ─── UPDATE CONTACT ─────────────────────────────────────────
// Builds the update payload from a whitelist to prevent unintended column
// writes. Only fields present in the request body are included.
clients.patch("/:id/contacts/:contactId", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);
  const body = await c.req.json();

  const updateFields: Record<string, unknown> = {};
  for (const field of ["name", "email", "phone", "phone2", "role", "distribute_code"]) {
    if (body[field] !== undefined) updateFields[field] = body[field];
  }

  const { data, error } = await sb
    .from("client_contacts")
    .update(updateFields)
    .eq("id", c.req.param("contactId"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data);
});

// ─── DELETE CONTACT ─────────────────────────────────────────
clients.delete("/:id/contacts/:contactId", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { error } = await sb
    .from("client_contacts")
    .delete()
    .eq("id", c.req.param("contactId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true });
});

export default clients;
