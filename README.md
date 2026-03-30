# zTicket API

REST API for the zTicket internal ticketing system. Built with Hono on Node.js, backed by Supabase (PostgreSQL, Auth, Storage). Deployed to Railway. This repo includes the SQL used to set up the Supabase database for this project in the "database" directory even though this Railway deployment does not directly utilize these scripts (just to avoid having a separate repo just hosting SQL schema and migrations).

The repo for the frontend of this application is here: https://github.com/Ian-MacGregor/zTicket

---

## Stack

- **Hono** — lightweight web framework
- **TypeScript** compiled with `tsc`
- **Supabase JS** — database queries, auth verification, file storage
- **Archiver** — zip file generation for bulk file downloads
- **Docker** — containerized deployment on Railway

---

## API Endpoints

All `/api/*` routes require an `Authorization: Bearer <supabase_access_token>` header.

### Health

| Method | Path      | Auth | Description       |
|--------|-----------|------|-------------------|
| GET    | `/health` | No   | Returns `{ status: "ok" }` |

### Tickets

| Method | Path                  | Description                              |
|--------|-----------------------|------------------------------------------|
| GET    | `/api/tickets/stats`  | Global ticket counts by status           |
| GET    | `/api/tickets`        | List tickets (paginated, filtered)       |
| GET    | `/api/tickets/:id`    | Get single ticket                        |
| POST   | `/api/tickets`        | Create ticket                            |
| PATCH  | `/api/tickets/:id`    | Update ticket                            |
| DELETE | `/api/tickets/:id`    | Delete ticket (cascades to comments, files, activity) |

Ticket responses include joined data for `assignee`, `reviewer`, `creator`, `client`, and `files`.

**`GET /api/tickets/stats`** — returns `{ total, unassigned, wait_hold, assigned, review, done }` reflecting the entire database regardless of any filters. Used by the dashboard stat cards.

**`GET /api/tickets` query parameters:**

| Parameter    | Default       | Description                                                   |
|--------------|---------------|---------------------------------------------------------------|
| `page`       | `1`           | Page number                                                   |
| `limit`      | `10`          | Results per page (max 200)                                    |
| `sort`       | `ref-desc`    | Sort key: `ref`, `title`, `status`, `priority`, `created`, `updated`, `client`, `owner` — each with `-asc` or `-desc` suffix |
| `status`     | `all`         | Filter by status value, `all`, or comma-separated values (e.g. `assigned,review`) |
| `priority`   | `all`         | Filter by priority enum value, or `all`                       |
| `client`     | `all`         | Filter by client UUID, or `all`                               |
| `view`       | `all`         | `my-tickets` or `my-reviews` (requires `userId`)             |
| `userId`     | —             | Current user UUID; used for `my-tickets` / `my-reviews`      |
| `search`     | —             | Search text                                                   |
| `searchType` | `description` | `description`, `ref`, `client`, `assignee`, `reviewer`, `created`, `updated` |

Response shape: `{ data: Ticket[], total: number }` where `total` is the untruncated filtered count (for pagination).

**Ticket fields:** title, description, priority (`low`/`medium`/`high`/`critical`), status (`unassigned`/`wait_hold`/`assigned`/`review`/`done`), assigned_to, reviewer, client_id, quote_required, quoted_time, quoted_price, quoted_amf, wait_hold_reason. Default status is `unassigned`.

### Emails

Stores Gmail message content imported by users directly into tickets. Email bodies are fetched client-side via the Gmail API and sent to this endpoint for storage, making them visible to all team members without requiring a shared Gmail account.

| Method | Path                                         | Description                              |
|--------|----------------------------------------------|------------------------------------------|
| GET    | `/api/tickets/:id/emails`                    | List all imported emails for a ticket    |
| POST   | `/api/tickets/:id/emails`                    | Import a Gmail message (store content)   |
| DELETE | `/api/tickets/:id/emails/:emailId`           | Remove an imported email from a ticket   |

Email responses include joined `importer` data (`id`, `full_name`, `email`). Emails are ordered by `received_at` descending. The POST endpoint uses upsert with `ON CONFLICT DO NOTHING` on `(ticket_id, gmail_message_id)` to safely handle duplicate imports.

**POST body fields:** `gmail_message_id` (required), `gmail_thread_id`, `subject`, `from_email`, `from_name`, `to_email`, `snippet`, `body_html`, `body_text`, `received_at`.

### Comments

Forum-style per-user comments on tickets. Only the comment author can edit their own comment (enforced by RLS). Deleting a ticket cascades and removes all its comments.

| Method | Path                                        | Description                        |
|--------|---------------------------------------------|------------------------------------|
| GET    | `/api/tickets/:id/comments`                 | List all comments for a ticket     |
| POST   | `/api/tickets/:id/comments`                 | Add a comment                      |
| PATCH  | `/api/tickets/:id/comments/:commentId`      | Edit own comment (RLS enforced)    |

Comment responses include joined `author` data (`id`, `email`, `full_name`). Comments are ordered oldest-first.

### Files

| Method | Path                                         | Description                |
|--------|----------------------------------------------|----------------------------|
| POST   | `/api/tickets/:id/files`                     | Upload files (multipart)   |
| GET    | `/api/tickets/:id/files`                     | List files for a ticket    |
| GET    | `/api/tickets/:id/files/:fid/download`       | Download single file       |
| GET    | `/api/tickets/:id/files/download-all`        | Download all as .zip       |
| DELETE | `/api/tickets/:id/files/:fid`                | Delete a file              |

Files are stored in Supabase Storage (`ticket-attachments` bucket). Metadata is tracked in the `ticket_files` table.

### Users

| Method | Path              | Description                      |
|--------|-------------------|----------------------------------|
| GET    | `/api/users`      | List all user profiles           |
| GET    | `/api/users/me`   | Current user profile             |
| PATCH  | `/api/users/me`   | Update current user's profile    |

**`PATCH /api/users/me` body fields:** `full_name`, `gmail_account`. Only these two fields are accepted; any others are ignored. Returns the updated profile row.

### Clients

| Method | Path                               | Description          |
|--------|------------------------------------|----------------------|
| GET    | `/api/clients`                     | List all clients     |
| GET    | `/api/clients/:id`                 | Get single client    |
| POST   | `/api/clients`                     | Create client        |
| PATCH  | `/api/clients/:id`                 | Update client name   |
| DELETE | `/api/clients/:id`                 | Delete client        |
| POST   | `/api/clients/:id/contacts`        | Add contact          |
| PATCH  | `/api/clients/:id/contacts/:cid`   | Update contact       |
| DELETE | `/api/clients/:id/contacts/:cid`   | Delete contact       |

Client responses include nested `contacts` array.

### Colors

| Method | Path          | Description                        |
|--------|---------------|------------------------------------|
| GET    | `/api/colors` | Get current user's color settings  |
| PATCH  | `/api/colors` | Save current user's color settings |

Color settings are per-user. The PATCH endpoint uses upsert, so no row needs to exist beforehand.

### Activity

| Method | Path            | Description                          |
|--------|-----------------|--------------------------------------|
| GET    | `/api/activity` | Paginated ticket activity event log  |

**Query parameters:**

| Parameter | Default | Description                        |
|-----------|---------|------------------------------------|
| `page`    | `1`     | Page number                        |
| `limit`   | `5`     | Results per page (max 200)         |

Response shape: `{ data: ActivityEvent[], total: number }`. Each event includes `ticket_id` and joined `ticket` (`ref_number`) and `actor` (`full_name`, `email`) data. Activity is logged automatically by the API on ticket create, ticket update, and comment create. Example action strings: `"created ticket"`, `"set status to \"Review\""`, `"added a comment"`, `"edited ticket"`.

The dashboard activity strip calls this endpoint with `limit=5` (default). The Activity page calls it with `limit=50` and supports full pagination.

---

## Project Structure

```
zTicket-api/
├── src/
│   ├── index.ts              # Entry point — server, CORS, route wiring
│   ├── types.ts              # Shared Hono env types (user, token)
│   ├── db/
│   │   └── supabase.ts       # Supabase client helpers (admin + per-user)
│   ├── middleware/
│   │   └── auth.ts           # JWT verification middleware
│   └── routes/
│       ├── tickets.ts        # Ticket CRUD + activity logging
│       ├── emails.ts         # Gmail message import/list/delete
│       ├── comments.ts       # Forum-style per-user comments
│       ├── files.ts          # File upload, download, zip, delete
│       ├── users.ts          # User profile listing
│       ├── clients.ts        # Client + contact CRUD
│       ├── colors.ts         # Per-user color settings
│       └── activity.ts       # Paginated activity feed
├── database/
│   ├── schema.sql            # Initial database schema (run first)
│   └── migrations/
│       ├── 001_add_ref_number.sql
│       ├── 002_add_clients.sql
│       ├── 003_add_colors.sql
│       ├── 004_colors_per_user.sql
│       ├── 005_add_ticket_fields.sql
│       ├── 006_add_statuses.sql
│       ├── 007_update_default_status.sql
│       ├── 008_tickets_delete_policy.sql
│       ├── 009_add_wait_hold.sql
│       ├── 010_add_status_updated_at.sql
│       ├── 011_replace_done_status.sql
│       ├── 012_add_quote_required.sql
│       ├── 013_add_ticket_comments.sql
│       ├── 014_add_ticket_activity.sql
│       ├── 015_add_ticket_emails.sql
│       └── 016_add_gmail_account.sql
├── Dockerfile
├── tsconfig.json
├── package.json
└── .env.example
```

---

## Database

### Initial Setup

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Run `database/schema.sql` in the SQL Editor. This creates all base tables, triggers, enums, and RLS policies.
3. Run each file in `database/migrations/` in numerical order:
   - `001_add_ref_number.sql` — auto-incrementing ticket reference numbers
   - `002_add_clients.sql` — clients and contacts tables
   - `003_add_colors.sql` — color settings table (initial)
   - `004_colors_per_user.sql` — convert colors to per-user with RLS
   - `005_add_ticket_fields.sql` — quoted time/price/AMF fields
   - `006_add_statuses.sql` — adds `unassigned` and `reserved` enum values
   - `007_update_default_status.sql` — sets `unassigned` as the default status (must be run separately after 006, as PostgreSQL requires new enum values to be committed before they can be referenced)
   - `008_tickets_delete_policy.sql` — adds missing DELETE RLS policy for the tickets table
   - `009_add_wait_hold.sql` — renames `reserved` to `wait_hold` and adds `wait_hold_reason` column
   - `010_add_status_updated_at.sql` — adds `status_updated_at` column; trigger stamps it on every status change
   - `011_replace_done_status.sql` — replaces `complete` and `sent` with a single `done` status; migrates existing data. **Note:** run `ALTER TABLE tickets ALTER COLUMN status DROP DEFAULT;` before dropping the type if Supabase errors on `DROP TYPE`.
   - `012_add_quote_required.sql` — adds `quote_required boolean NOT NULL DEFAULT false` column to tickets
   - `013_add_ticket_comments.sql` — creates `ticket_comments` table with RLS; migrates any existing `tickets.comments` text into comment rows attributed to the ticket creator; drops the old `comments` column
   - `014_add_ticket_activity.sql` — creates `ticket_activity` table with RLS for the activity feed
   - `015_add_ticket_emails.sql` — drops the old `gmail_links text[]` column from tickets; creates `ticket_emails` table with RLS to store imported Gmail message content (subject, sender, body, etc.) linked per ticket
   - `016_add_gmail_account.sql` — adds `gmail_account text` column to `profiles` to persist each user's linked Google account email across sessions
4. Create a storage bucket named `ticket-attachments` (private) and add RLS policies for authenticated users (SELECT, INSERT, DELETE).
5. Add allowed email addresses to the `allowed_emails` table.

### Key Tables

| Table              | Purpose                                                    |
|--------------------|------------------------------------------------------------|
| `allowed_emails`   | Email allowlist for registration                           |
| `profiles`         | User profiles (auto-created on signup); includes `gmail_account` for Gmail integration |
| `tickets`          | All ticket data                                            |
| `ticket_files`     | File attachment metadata                                   |
| `ticket_comments`  | Forum-style per-user comments; cascades on ticket delete   |
| `ticket_activity`  | Activity log for the dashboard feed; cascades on ticket delete |
| `ticket_emails`    | Imported Gmail message content linked to tickets; cascades on ticket delete |
| `clients`          | Client companies                                           |
| `client_contacts`  | Contacts per client                                        |
| `color_settings`   | Per-user color customization (JSON blob)                   |

### Triggers

| Trigger                       | Fires on                   | Purpose                                            |
|-------------------------------|----------------------------|----------------------------------------------------|
| `enforce_allowed_email`       | `auth.users` INSERT        | Blocks signups from non-allowlisted emails         |
| `on_auth_user_created`        | `auth.users` INSERT        | Auto-creates a profile row                         |
| `tickets_updated_at`          | `tickets` UPDATE           | Sets `updated_at` to `now()`                       |
| `tickets_status_dates`        | `tickets` UPDATE           | Auto-sets `date_completed` and `status_updated_at` |
| `clients_updated_at`          | `clients` UPDATE           | Sets `updated_at` to `now()`                       |
| `ticket_comments_updated_at`  | `ticket_comments` UPDATE   | Sets `updated_at` to `now()`                       |

### Row-Level Security

All tables have RLS enabled. Authenticated users can read all tickets, clients, profiles, comments, and activity. Users can only edit/delete their own comments (enforced via `user_id = auth.uid()`). Users can only read/write their own color settings. File and ticket mutations are open to all authenticated users.

---

## Environment Variables

| Variable                    | Description                                   |
|-----------------------------|-----------------------------------------------|
| `SUPABASE_URL`              | Supabase project URL                          |
| `SUPABASE_ANON_KEY`         | Supabase anon/public key                      |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only)   |
| `PORT`                      | Server port (default: 3000)                   |

Copy `.env.example` to `.env` for local development. On Railway, set these as environment variables in the service settings.

---

## Local Development

```bash
npm install
npm run dev
```

Runs with `tsx watch` for hot reloading on `http://localhost:3000`.

### Type checking

```bash
npx tsc --noEmit
```

### Docker build (matches Railway)

```bash
docker build -t zticket-api .
docker run -p 3000:3000 --env-file .env zticket-api
```

---

## Deployment (Railway)

1. Push this repo to GitHub.
2. Create a new Railway project → **Deploy from GitHub Repo**.
3. Railway auto-detects the Dockerfile. Set the environment variables listed above.
4. Deploy. Railway provides a public URL (e.g. `https://zticket-api-production.up.railway.app`).
5. Update the CORS origin in `src/index.ts` to your GitHub Pages domain. `http://localhost:5173` is included by default for local frontend development:
   ```ts
   origin: ["https://your-username.github.io", "http://localhost:5173"]
   ```

The Dockerfile runs `npm install`, `tsc` to compile TypeScript, and starts the server with `node dist/index.js`.

---

## Authentication

The API does not handle login/signup directly — that's done by the frontend talking to Supabase Auth. The API receives the Supabase JWT in the `Authorization` header and verifies it using `supabaseAdmin.auth.getUser(token)`. The verified user and token are attached to the Hono context for use in route handlers.

Each route creates a per-request Supabase client using the user's token (`supabaseForUser`), so all queries respect Row-Level Security policies.

---

## File Storage

Files are uploaded to the `ticket-attachments` bucket in Supabase Storage. The upload flow:

1. Frontend sends a multipart form to `POST /api/tickets/:id/files`.
2. The API streams each file to Supabase Storage under `{ticketId}/{timestamp}_{filename}`.
3. A metadata row is created in `ticket_files` with the file path, size, and MIME type.
4. The zip download endpoint (`GET /api/tickets/:id/files/download-all`) fetches all files from storage, pipes them through `archiver`, and returns the zip as a binary response.
