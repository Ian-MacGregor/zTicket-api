import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { authMiddleware } from "./middleware/auth.js";
import ticketRoutes from "./routes/tickets.js";
import fileRoutes from "./routes/files.js";
import userRoutes from "./routes/users.js";

const app = new Hono();

// ─── GLOBAL MIDDLEWARE ──────────────────────────────────────
app.use("*", logger());
app.use(
  "*",
  cors({
    // In production, restrict to your GitHub Pages domain:
    //   origin: "https://yourorg.github.io"
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Disposition"],
  })
);

// ─── HEALTH CHECK (unauthenticated) ────────────────────────
app.get("/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));

// ─── AUTHENTICATED ROUTES ───────────────────────────────────
app.use("/api/*", authMiddleware);

app.route("/api/tickets", ticketRoutes);
app.route("/api/tickets", fileRoutes);       // nested under /api/tickets/:ticketId/files
app.route("/api/users", userRoutes);

// ─── START SERVER ───────────────────────────────────────────
const port = parseInt(process.env.PORT || "3000", 10);
console.log(`🚀 Ticketing API listening on port ${port}`);

serve({ fetch: app.fetch, port });
