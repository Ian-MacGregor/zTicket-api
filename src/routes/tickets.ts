/**
 * routes/tickets.ts
 *
 * Ticket CRUD routes and the global stats endpoint.
 *
 * Endpoints:
 *   GET  /stats        — count of tickets grouped by status (unfiltered)
 *   GET  /             — paginated, filtered, sorted ticket list
 *   GET  /:id          — single ticket with all relations
 *   POST /             — create a ticket
 *   PATCH /:id         — partial update (whitelist of allowed fields)
 *   DELETE /:id        — delete a ticket
 *
 * All mutating operations write a human-readable entry to ticket_activity so
 * the activity feed reflects what changed.
 *
 * The /stats route must be registered before /:id to prevent "stats" from
 * being matched as a ticket ID.
 */

import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const tickets = new Hono<AppEnv>();

/** Maps internal status keys to display labels used in activity log entries. */
const STATUS_LABELS: Record<string, string> = {
  unassigned: "Unassigned",
  wait_hold:  "Wait/Hold",
  assigned:   "Assigned",
  review:     "Review",
  done:       "Done",
};

/**
 * Writes a single row to the ticket_activity table.
 * Failures are silently swallowed so a logging error never breaks the main
 * request flow.
 */
async function logActivity(sb: any, ticketId: string, userId: string, action: string) {
  try {
    await sb.from("ticket_activity").insert({ ticket_id: ticketId, user_id: userId, action });
  } catch {}
}

// Full select with file attachments — used for single-ticket fetches and updates.
const TICKET_SELECT = `
  *,
  assignee:assigned_to ( id, email, full_name ),
  reviewer:reviewer    ( id, email, full_name ),
  creator:created_by   ( id, email, full_name ),
  client:client_id     ( id, name ),
  files:ticket_files   ( id, file_name, file_path, file_size, mime_type, created_at )
`;

// Lighter select without files — used on create to avoid an extra join.
const TICKET_SELECT_NO_FILES = `
  *,
  assignee:assigned_to ( id, email, full_name ),
  reviewer:reviewer    ( id, email, full_name ),
  creator:created_by   ( id, email, full_name ),
  client:client_id     ( id, name )
`;

// ─── STATS (must be before /:id) ───────────────────────────
// Fetches only the status column for all tickets and aggregates the counts
// in application code. Returns { total, unassigned, wait_hold, assigned,
// review, done }.
tickets.get("/stats", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb.from("tickets").select("status");
  if (error) return c.json({ error: error.message }, 500);

  const stats: Record<string, number> = {
    total: 0, unassigned: 0, wait_hold: 0, assigned: 0, review: 0, done: 0,
  };
  for (const t of data ?? []) {
    stats.total++;
    if (t.status in stats) stats[t.status]++;
  }
  return c.json(stats);
});

// ─── LIST TICKETS (server-side filtered, sorted, paginated) ─
// Accepts query params: page, limit, sort, status, priority, client, view,
// userId, search, searchType. All filters are optional and default to "all"
// (no filter applied). Limit is capped at 200 to prevent runaway queries.
tickets.get("/", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const page       = Math.max(1, parseInt(c.req.query("page")       || "1"));
  const limit      = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "10")));
  const sort       = c.req.query("sort")       || "ref-desc";
  const status     = c.req.query("status")     || "all";
  const priority   = c.req.query("priority")   || "all";
  const clientId   = c.req.query("client")     || "all";
  const view       = c.req.query("view")       || "all";
  const userId     = c.req.query("userId")     || "";
  const search     = c.req.query("search")     || "";
  const searchType = c.req.query("searchType") || "description";

  let query = sb.from("tickets").select(TICKET_SELECT, { count: "exact" });

  // ── Status filter ──────────────────────────────────────
  // Supports comma-separated values (e.g. "assigned,review" for the "active" preset).
  if (status !== "all") {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) query = query.eq("status", statuses[0]);
    else query = query.in("status", statuses);
  }

  // ── Priority filter ────────────────────────────────────
  if (priority !== "all") query = query.eq("priority", priority);

  // ── Client filter ──────────────────────────────────────
  if (clientId !== "all") query = query.eq("client_id", clientId);

  // ── View filter (my-tickets / my-reviews) ─────────────
  // "my-tickets" restricts to tickets assigned to the calling user, limited to
  // active statuses. "my-reviews" restricts to tickets in review where the
  // caller is the reviewer. Incompatible status combinations return empty early.
  if (view === "my-tickets" && userId) {
    query = query.eq("assigned_to", userId);
    const myStatuses = ["wait_hold", "assigned", "review"];
    if (status === "all") {
      query = query.in("status", myStatuses);
    } else if (!myStatuses.includes(status)) {
      return c.json({ data: [], total: 0 });
    }
  } else if (view === "my-reviews" && userId) {
    query = query.eq("reviewer", userId);
    if (status === "all") {
      query = query.eq("status", "review");
    } else if (status !== "review") {
      return c.json({ data: [], total: 0 });
    }
  }

  // ── Search filter ──────────────────────────────────────
  // searchType determines which column(s) are searched. For relational searches
  // (client, assignee, reviewer) we first resolve matching IDs with a separate
  // query and return empty if no matches are found, avoiding a full-table scan.
  if (search) {
    switch (searchType) {
      case "description":
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
        break;
      case "ref": {
        const n = parseInt(search);
        if (!isNaN(n)) query = query.eq("ref_number", n);
        break;
      }
      case "client": {
        const { data: cls } = await sb.from("clients").select("id").ilike("name", `%${search}%`);
        const ids = (cls ?? []).map((r: any) => r.id);
        if (ids.length === 0) return c.json({ data: [], total: 0 });
        query = query.in("client_id", ids);
        break;
      }
      case "assignee": {
        const { data: prs } = await sb.from("profiles").select("id").ilike("full_name", `%${search}%`);
        const ids = (prs ?? []).map((r: any) => r.id);
        if (ids.length === 0) return c.json({ data: [], total: 0 });
        query = query.in("assigned_to", ids);
        break;
      }
      case "reviewer": {
        const { data: prs } = await sb.from("profiles").select("id").ilike("full_name", `%${search}%`);
        const ids = (prs ?? []).map((r: any) => r.id);
        if (ids.length === 0) return c.json({ data: [], total: 0 });
        query = query.in("reviewer", ids);
        break;
      }
      case "created": {
        // Matches tickets created on the given calendar day (local time boundaries).
        const d = new Date(search);
        if (!isNaN(d.getTime())) {
          const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
          const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
          query = query.gte("created_at", start).lt("created_at", end);
        }
        break;
      }
      case "updated": {
        // Matches tickets whose status was last updated on the given calendar day.
        const d = new Date(search);
        if (!isNaN(d.getTime())) {
          const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
          const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
          query = query.gte("status_updated_at", start).lt("status_updated_at", end);
        }
        break;
      }
    }
  }

  // ── Sort ───────────────────────────────────────────────
  // ticket_priority enum order: low, medium, high, critical (ascending = low→critical)
  // ticket_status enum order: unassigned, wait_hold, assigned, review, done
  // owner sort uses assignee name as the proxy column (reviewer vs assignee
  // distinction is handled in the UI only).
  switch (sort) {
    case "ref-asc":       query = query.order("ref_number",       { ascending: true  }); break;
    case "ref-desc":      query = query.order("ref_number",       { ascending: false }); break;
    case "title-asc":     query = query.order("title",            { ascending: true  }); break;
    case "title-desc":    query = query.order("title",            { ascending: false }); break;
    case "status-asc":    query = query.order("status",           { ascending: true  }); break;
    case "status-desc":   query = query.order("status",           { ascending: false }); break;
    case "priority-asc":  query = query.order("priority",         { ascending: true  }); break;
    case "priority-desc": query = query.order("priority",         { ascending: false }); break;
    case "created-asc":   query = query.order("created_at",       { ascending: true  }); break;
    case "created-desc":  query = query.order("created_at",       { ascending: false }); break;
    case "updated-asc":   query = query.order("status_updated_at",{ ascending: true  }); break;
    case "updated-desc":  query = query.order("status_updated_at",{ ascending: false }); break;
    case "client-asc":    query = query.order("name", { ascending: true,  referencedTable: "clients" }); break;
    case "client-desc":   query = query.order("name", { ascending: false, referencedTable: "clients" }); break;
    // owner sort: sort by assignee name as proxy (reviewer-conditional logic is UI-only)
    case "owner-asc":     query = query.order("full_name", { ascending: true,  referencedTable: "profiles" }); break;
    case "owner-desc":    query = query.order("full_name", { ascending: false, referencedTable: "profiles" }); break;
    default:              query = query.order("ref_number",       { ascending: false }); break;
  }

  // ── Pagination ─────────────────────────────────────────
  const from = (page - 1) * limit;
  const to   = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data: data ?? [], total: count ?? 0 });
});

// ─── GET SINGLE TICKET ─────────────────────────────────────
// Returns the full ticket record including files, assignee, reviewer, creator,
// and client relations. Returns 404 if the ticket is not found.
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
// Sets created_by to the calling user's ID. Returns 201 with the new ticket
// (without files — no files exist yet). Logs a "created ticket" activity entry.
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
      quote_required: body.quote_required || false,
      quoted_time: body.quoted_time || null,
      quoted_price: body.quoted_price || null,
      quoted_amf: body.quoted_amf || null,
      created_by: user.id,
    })
    .select(TICKET_SELECT_NO_FILES)
    .single();

  if (error) return c.json({ error: error.message }, 400);
  await logActivity(sb, data.id, user.id, "created ticket");
  return c.json(data, 201);
});

// ─── UPDATE TICKET ──────────────────────────────────────────
// Only fields present in allowedFields are written; unknown body keys are
// ignored to prevent accidental column overwrites. The activity action is
// derived from which fields changed so the log reads naturally ("set status
// to Assigned" rather than "edited ticket").
tickets.patch("/:id", async (c) => {
  const token = c.get("token") as string;
  const user  = c.get("user") as { id: string };
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
    "quote_required",
    "quoted_time",
    "quoted_price",
    "quoted_amf",
    "wait_hold_reason",
  ];

  // Build the update payload from only the whitelisted fields present in the body.
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

  // Derive a human-readable action from what changed for the activity log.
  // Priority: status change > reviewer change > assignee change > generic edit.
  let action = "edited ticket";
  if (!("title" in body)) {
    if ("status" in body)
      action = `set status to "${STATUS_LABELS[body.status] ?? body.status}"`;
    else if ("reviewer" in body)
      action = body.reviewer ? "assigned a reviewer" : "removed the reviewer";
    else if ("assigned_to" in body)
      action = body.assigned_to ? "assigned a developer" : "unassigned the developer";
  }
  await logActivity(sb, c.req.param("id"), user.id, action);

  return c.json(data);
});

// ─── DELETE TICKET ──────────────────────────────────────────
// Hard-deletes the ticket. Cascading deletes for files, comments, emails, and
// activity records are handled at the database level via foreign key constraints.
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
