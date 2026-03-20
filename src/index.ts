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

const app = new Hono();

// ─── GLOBAL MIDDLEWARE ──────────────────────────────────────
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["https://ian-macgregor.github.io"],
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
app.route("/api/tickets", fileRoutes);        // nested under /api/tickets/:ticketId/files
app.route("/api/tickets", commentRoutes);     // nested under /api/tickets/:ticketId/comments
app.route("/api/users", userRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/colors", colorRoutes);
app.route("/api/activity", activityRoutes);

// ─── START SERVER ───────────────────────────────────────────
const port = parseInt(process.env.PORT || "3000", 10);
console.log(`🚀 Ticketing API listening on port ${port}`);

serve({ fetch: app.fetch, port });
