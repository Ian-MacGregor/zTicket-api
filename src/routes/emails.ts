import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const emails = new Hono<AppEnv>();

// ─── LIST EMAILS FOR A TICKET ───────────────────────────────
emails.get("/:ticketId/emails", async (c) => {
  const sb = supabaseForUser(c.get("token") as string);

  const { data, error } = await sb
    .from("ticket_emails")
    .select(`
      id, gmail_message_id, gmail_thread_id,
      subject, from_email, from_name, to_email,
      snippet, body_html, body_text,
      received_at, created_at,
      importer:imported_by ( id, full_name, email )
    `)
    .eq("ticket_id", c.req.param("ticketId"))
    .order("received_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

// ─── IMPORT AN EMAIL ────────────────────────────────────────
emails.post("/:ticketId/emails", async (c) => {
  const token = c.get("token") as string;
  const user  = c.get("user") as { id: string };
  const sb    = supabaseForUser(token);
  const body  = await c.req.json();

  const { data, error } = await sb
    .from("ticket_emails")
    .upsert(
      {
        ticket_id:        c.req.param("ticketId"),
        gmail_message_id: body.gmail_message_id,
        gmail_thread_id:  body.gmail_thread_id  ?? null,
        subject:          body.subject          ?? null,
        from_email:       body.from_email       ?? null,
        from_name:        body.from_name        ?? null,
        to_email:         body.to_email         ?? null,
        snippet:          body.snippet          ?? null,
        body_html:        body.body_html         ?? null,
        body_text:        body.body_text         ?? null,
        received_at:      body.received_at       ?? null,
        imported_by:      user.id,
      },
      { onConflict: "ticket_id,gmail_message_id", ignoreDuplicates: true }
    )
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json(data, 201);
});

// ─── REMOVE AN EMAIL FROM A TICKET ─────────────────────────
emails.delete("/:ticketId/emails/:emailId", async (c) => {
  const sb = supabaseForUser(c.get("token") as string);

  const { error } = await sb
    .from("ticket_emails")
    .delete()
    .eq("id", c.req.param("emailId"))
    .eq("ticket_id", c.req.param("ticketId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true });
});

export default emails;
