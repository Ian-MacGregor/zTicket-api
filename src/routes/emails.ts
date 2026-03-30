/**
 * routes/emails.ts
 *
 * Gmail message import routes nested under /api/tickets/:ticketId/emails.
 * Allows users to link Gmail messages to a ticket for context and reference.
 * The full message body (HTML or plain text) is stored in the database so it
 * remains accessible even if the original Gmail message is later deleted.
 *
 * Emails are keyed on (ticket_id, gmail_message_id) — importing the same
 * message twice is silently de-duplicated via upsert with ignoreDuplicates.
 *
 * Endpoints:
 *   GET    /:ticketId/emails             — list linked emails (newest received first)
 *   POST   /:ticketId/emails             — import a Gmail message
 *   DELETE /:ticketId/emails/:emailId    — unlink an email from the ticket
 */

import { Hono } from "hono";
import { supabaseForUser } from "../db/supabase";
import type { AppEnv } from "../types";

const emails = new Hono<AppEnv>();

// ─── LIST EMAILS FOR A TICKET ───────────────────────────────
// Returns linked emails ordered by received_at descending. Includes the
// importer's profile so the UI can show who imported each message.
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
// The client sends the full Gmail message payload (fetched client-side via the
// Gmail API). Uses upsert with ignoreDuplicates so re-importing the same
// message is a no-op rather than an error. Records imported_by so the UI can
// show who linked the message.
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
// Unlinks the email from the ticket (deletes the ticket_emails row).
// The original Gmail message is not affected.
// Both :emailId and :ticketId are matched to prevent cross-ticket deletions.
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
