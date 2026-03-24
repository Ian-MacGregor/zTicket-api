import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const tickets = new Hono<AppEnv>();

const STATUS_LABELS: Record<string, string> = {
  unassigned: "Unassigned",
  wait_hold:  "Wait/Hold",
  assigned:   "Assigned",
  review:     "Review",
  done:       "Done",
};

async function logActivity(sb: any, ticketId: string, userId: string, action: string) {
  try {
    await sb.from("ticket_activity").insert({ ticket_id: ticketId, user_id: userId, action });
  } catch {}
}

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

// ─── STATS (must be before /:id) ───────────────────────────
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
        const d = new Date(search);
        if (!isNaN(d.getTime())) {
          const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
          const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
          query = query.gte("created_at", start).lt("created_at", end);
        }
        break;
      }
      case "updated": {
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

  // Derive a human-readable action from what changed
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
