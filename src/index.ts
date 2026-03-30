/**
 * index.ts
 *
 * Application entry point for the zTicket API server. Builds the Hono app,
 * registers global middleware, mounts all route modules, and starts the
 * Node.js HTTP server.
 *
 * Route map (all /api/* routes require a valid Bearer token):
 *   GET  /health                                  — unauthenticated health check
 *   /api/tickets                                  — ticket CRUD + stats
 *   /api/tickets/:ticketId/files                  — file upload / download / delete
 *   /api/tickets/:ticketId/comments               — comment thread
 *   /api/tickets/:ticketId/emails                 — linked Gmail messages
 *   /api/users                                    — user profiles
 *   /api/clients                                  — client + contact management
 *   /api/colors                                   — per-user color theme settings
 *   /api/activity                                 — paginated audit log
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { authMiddleware } from "./middleware/auth";
import ticketRoutes from "./routes/tickets";
import fileRoutes from "./routes/files";
import commentRoutes from "./routes/comments";
import userRoutes from "./routes/users";
import clientRoutes from "./routes/clients";
import colorRoutes from "./routes/colors";
import activityRoutes from "./routes/activity";
import emailRoutes from "./routes/emails";

const app = new Hono();

// ─── GLOBAL MIDDLEWARE ──────────────────────────────────────
// logger() writes method + path + status to stdout for every request.
// cors() restricts cross-origin access to the known frontend origins.
// Content-Disposition is exposed so browsers can read the filename on
// file download responses.
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["https://ian-macgregor.github.io", "http://localhost:5173"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Disposition"],
  })
);

// ─── HEALTH CHECK (unauthenticated) ────────────────────────
// Used by uptime monitors and deployment pipelines to confirm the server
// is running without needing a valid auth token.
app.get("/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));

// ─── AUTHENTICATED ROUTES ───────────────────────────────────
// authMiddleware validates the Bearer JWT and attaches `user` + `token` to
// the Hono context. All /api/* routes run after this middleware.
app.use("/api/*", authMiddleware);

app.route("/api/tickets", ticketRoutes);
app.route("/api/tickets", fileRoutes);        // nested under /api/tickets/:ticketId/files
app.route("/api/tickets", commentRoutes);     // nested under /api/tickets/:ticketId/comments
app.route("/api/tickets", emailRoutes);       // nested under /api/tickets/:ticketId/emails
app.route("/api/users", userRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/colors", colorRoutes);
app.route("/api/activity", activityRoutes);

// ─── START SERVER ───────────────────────────────────────────
// PORT is injected by the hosting platform (e.g. Render); defaults to 3000
// for local development.
const port = parseInt(process.env.PORT || "3000", 10);
console.log(`🚀 Ticketing API listening on port ${port}`);

serve({ fetch: app.fetch, port });
