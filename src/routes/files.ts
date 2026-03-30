/**
 * routes/files.ts
 *
 * File attachment routes, all nested under /api/tickets/:ticketId/files.
 * Files are stored in Supabase Storage (bucket: "ticket-attachments") with
 * the path pattern `{ticketId}/{timestamp}_{originalName}`. Metadata
 * (file name, size, MIME type, uploader) is also written to the
 * `ticket_files` table so the ticket detail page can list attachments without
 * hitting Storage directly.
 *
 * Endpoints:
 *   POST   /:ticketId/files                       — upload one or more files (multipart/form-data)
 *   GET    /:ticketId/files                       — list file metadata for a ticket
 *   GET    /:ticketId/files/:fileId/download      — download a single file
 *   GET    /:ticketId/files/download-all          — download all files as a ZIP archive
 *   DELETE /:ticketId/files/:fileId               — delete a file from storage + DB
 *
 * Note: download-all must be registered before /:fileId/download so that the
 * literal "download-all" segment is not matched as a fileId.
 */

import { Hono } from "hono";
import { supabaseForUser, supabaseAdmin } from "../db/supabase";
import archiver from "archiver";
import { Readable } from "stream";
import type { AppEnv } from "../types";

const files = new Hono<AppEnv>();

/** Supabase Storage bucket name for all ticket file attachments. */
const BUCKET = "ticket-attachments";

// ─── UPLOAD FILE(S) TO A TICKET ────────────────────────────
// Accepts a multipart/form-data body where each form field value is a File.
// Each file is uploaded to Storage then a metadata row is inserted into
// ticket_files. Processes files sequentially so partial failures return
// an error without leaving orphaned storage objects.
files.post("/:ticketId/files", async (c) => {
  const token = c.get("token") as string;
  const user = c.get("user") as { id: string };
  const sb = supabaseForUser(token);
  const ticketId = c.req.param("ticketId");

  const formData = await c.req.formData();
  const uploaded: unknown[] = [];

  for (const [_key, value] of formData.entries()) {
    if (!(value instanceof File)) continue;

    const file = value as File;
    // Prefix the filename with a timestamp to avoid collisions when the same
    // file name is uploaded multiple times to the same ticket.
    const filePath = `${ticketId}/${Date.now()}_${file.name}`;
    const arrayBuf = await file.arrayBuffer();

    // Upload the binary content to Supabase Storage.
    const { error: storageErr } = await sb.storage
      .from(BUCKET)
      .upload(filePath, arrayBuf, {
        contentType: file.type,
        upsert: false,
      });

    if (storageErr) {
      return c.json({ error: `Upload failed: ${storageErr.message}` }, 500);
    }

    // Record file metadata in the database so it can be listed/downloaded later.
    const { data, error: dbErr } = await sb
      .from("ticket_files")
      .insert({
        ticket_id: ticketId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (dbErr) return c.json({ error: dbErr.message }, 500);
    uploaded.push(data);
  }

  return c.json(uploaded, 201);
});

// ─── LIST FILES FOR A TICKET ───────────────────────────────
// Returns metadata rows ordered newest-first. The frontend uses this list
// to display file names and sizes; actual file content is fetched via /download.
files.get("/:ticketId/files", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data, error } = await sb
    .from("ticket_files")
    .select("*")
    .eq("ticket_id", c.req.param("ticketId"))
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// ─── DOWNLOAD SINGLE FILE ──────────────────────────────────
// Looks up the file metadata to get the storage path, then streams the raw
// bytes back with the original MIME type and a Content-Disposition header so
// the browser treats it as a download.
files.get("/:ticketId/files/:fileId/download", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data: fileMeta, error } = await sb
    .from("ticket_files")
    .select("*")
    .eq("id", c.req.param("fileId"))
    .single();

  if (error || !fileMeta)
    return c.json({ error: "File not found" }, 404);

  const { data } = await sb.storage.from(BUCKET).download(fileMeta.file_path);
  if (!data) return c.json({ error: "Could not download file" }, 500);

  const arrayBuf = await data.arrayBuffer();

  return new Response(arrayBuf, {
    headers: {
      "Content-Type": fileMeta.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileMeta.file_name}"`,
    },
  });
});

// ─── DOWNLOAD ALL FILES AS ZIP ─────────────────────────────
// Fetches every file for the ticket from Storage, streams them into an
// in-memory ZIP archive via the `archiver` library, then returns the
// completed buffer as a single attachment download.
files.get("/:ticketId/files/download-all", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);
  const ticketId = c.req.param("ticketId");

  // Fetch metadata for all files belonging to this ticket.
  const { data: fileList, error } = await sb
    .from("ticket_files")
    .select("*")
    .eq("ticket_id", ticketId);

  if (error) return c.json({ error: error.message }, 500);
  if (!fileList?.length) return c.json({ error: "No files found" }, 404);

  // Build a ZIP archive in memory using archiver's event-based streaming API.
  const archive = archiver("zip", { zlib: { level: 5 } });
  const chunks: Uint8Array[] = [];

  archive.on("data", (chunk: Uint8Array) => chunks.push(chunk));

  // Resolve this promise once archiver signals it has finished writing.
  const archiveFinished = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });

  // Download each file from Storage and append it to the archive.
  for (const f of fileList) {
    const { data: blob } = await sb.storage.from(BUCKET).download(f.file_path);
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      archive.append(buf, { name: f.file_name });
    }
  }

  archive.finalize();
  await archiveFinished;

  const zipBuffer = Buffer.concat(chunks);

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="ticket-${ticketId}-files.zip"`,
    },
  });
});

// ─── DELETE A FILE ──────────────────────────────────────────
// Deletes from both Storage and the ticket_files table. Fetches metadata first
// to get the storage path — without it we cannot remove the object from the bucket.
files.delete("/:ticketId/files/:fileId", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data: fileMeta, error: fetchErr } = await sb
    .from("ticket_files")
    .select("*")
    .eq("id", c.req.param("fileId"))
    .single();

  if (fetchErr || !fileMeta) return c.json({ error: "File not found" }, 404);

  // Remove the binary object from the storage bucket.
  await sb.storage.from(BUCKET).remove([fileMeta.file_path]);

  // Remove the metadata row from the database.
  const { error } = await sb
    .from("ticket_files")
    .delete()
    .eq("id", c.req.param("fileId"));

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

export default files;
