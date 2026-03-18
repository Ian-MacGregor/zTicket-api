import { Hono } from "hono";
import { supabaseForUser, supabaseAdmin } from "../db/supabase";
import archiver from "archiver";
import { Readable } from "stream";
import type { AppEnv } from "../types";

const files = new Hono<AppEnv>();

const BUCKET = "ticket-attachments";

// ─── UPLOAD FILE(S) TO A TICKET ────────────────────────────
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
    const filePath = `${ticketId}/${Date.now()}_${file.name}`;
    const arrayBuf = await file.arrayBuffer();

    // Upload to Supabase Storage
    const { error: storageErr } = await sb.storage
      .from(BUCKET)
      .upload(filePath, arrayBuf, {
        contentType: file.type,
        upsert: false,
      });

    if (storageErr) {
      return c.json({ error: `Upload failed: ${storageErr.message}` }, 500);
    }

    // Record metadata in ticket_files
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
files.get("/:ticketId/files/download-all", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);
  const ticketId = c.req.param("ticketId");

  // Get all file metadata
  const { data: fileList, error } = await sb
    .from("ticket_files")
    .select("*")
    .eq("ticket_id", ticketId);

  if (error) return c.json({ error: error.message }, 500);
  if (!fileList?.length) return c.json({ error: "No files found" }, 404);

  // Build a ZIP archive in memory
  const archive = archiver("zip", { zlib: { level: 5 } });
  const chunks: Uint8Array[] = [];

  archive.on("data", (chunk: Uint8Array) => chunks.push(chunk));

  const archiveFinished = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });

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
files.delete("/:ticketId/files/:fileId", async (c) => {
  const token = c.get("token") as string;
  const sb = supabaseForUser(token);

  const { data: fileMeta, error: fetchErr } = await sb
    .from("ticket_files")
    .select("*")
    .eq("id", c.req.param("fileId"))
    .single();

  if (fetchErr || !fileMeta) return c.json({ error: "File not found" }, 404);

  // Delete from storage
  await sb.storage.from(BUCKET).remove([fileMeta.file_path]);

  // Delete DB record
  const { error } = await sb
    .from("ticket_files")
    .delete()
    .eq("id", c.req.param("fileId"));

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

export default files;
