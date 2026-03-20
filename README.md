# zTicket API

REST API for the zTicket internal ticketing system. Built with Hono on Node.js, backed by Supabase (PostgreSQL, Auth, Storage). Deployed to Railway.

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

| Method | Path              | Description                    |
|--------|-------------------|--------------------------------|
| GET    | `/api/tickets`    | List all tickets (with joins)  |
| GET    | `/api/tickets/:id`| Get single ticket              |
| POST   | `/api/tickets`    | Create ticket                  |
| PATCH  | `/api/tickets/:id`| Update ticket                  |
| DELETE | `/api/tickets/:id`| Delete ticket                  |

Ticket responses include joined data for `assignee`, `reviewer`, `creator`, `client`, and `files`.

**Ticket fields:** title, description, priority (`low`/`medium`/`high`/`critical`), status (`unassigned`/`reserved`/`assigned`/`review`/`complete`/`sent`), assigned_to, reviewer, client_id, gmail_links, quoted_time, quoted_price, quoted_amf, comments. Default status is `unassigned`.

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

| Method | Path            | Description           |
|--------|-----------------|-----------------------|
| GET    | `/api/users`    | List all user profiles|
| GET    | `/api/users/me` | Current user profile  |

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
│       ├── tickets.ts        # Ticket CRUD
│       ├── files.ts          # File upload, download, zip, delete
│       ├── users.ts          # User profile listing
│       ├── clients.ts        # Client + contact CRUD
│       └── colors.ts         # Per-user color settings
├── database/
│   ├── schema.sql            # Initial database schema (run first)
│   └── migrations/
│       ├── add_ref_number.sql    # Auto-incrementing ticket reference numbers
│       ├── add_clients.sql       # Clients and contacts tables
│       ├── add_colors.sql        # Color settings table (initial)
│       ├── colors_per_user.sql   # Convert colors to per-user with RLS
│       └── add_ticket_fields.sql # Quoted time/price/AMF and comments
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
3. Run each file in `database/migrations/` in order:
   - `001_add_ref_number.sql`
   - `002_add_clients.sql`
   - `003_add_colors.sql`
   - `004_colors_per_user.sql`
   - `005_add_ticket_fields.sql`
   - `006_add_statuses.sql` — adds `unassigned` and `reserved` enum values
   - `007_update_default_status.sql` — sets `unassigned` as the default status (must be run separately after 006, as PostgreSQL requires new enum values to be committed before they can be referenced)
   - `008_tickets_delete_policy.sql` — adds missing DELETE RLS policy for the tickets table
   - `009_add_wait_hold.sql` — renames `reserved` enum value to `wait_hold` and adds `wait_hold_reason` column
4. Create a storage bucket named `ticket-attachments` (private) and add RLS policies for authenticated users (SELECT, INSERT, DELETE).
5. Add allowed email addresses to the `allowed_emails` table.

### Key Tables

| Table              | Purpose                                      |
|--------------------|----------------------------------------------|
| `allowed_emails`   | Email allowlist for registration              |
| `profiles`         | User profiles (auto-created on signup)        |
| `tickets`          | All ticket data                               |
| `ticket_files`     | File attachment metadata                      |
| `clients`          | Client companies                              |
| `client_contacts`  | Contacts per client                           |
| `color_settings`   | Per-user color customization (JSON blob)      |

### Triggers

| Trigger                 | Fires on              | Purpose                                           |
|-------------------------|-----------------------|---------------------------------------------------|
| `enforce_allowed_email` | `auth.users` INSERT   | Blocks signups from non-allowlisted emails        |
| `on_auth_user_created`  | `auth.users` INSERT   | Auto-creates a profile row                        |
| `tickets_updated_at`    | `tickets` UPDATE      | Sets `updated_at` to `now()`                      |
| `tickets_status_dates`  | `tickets` UPDATE      | Auto-sets `date_completed` and `date_sent`        |
| `clients_updated_at`    | `clients` UPDATE      | Sets `updated_at` to `now()`                      |

### Row-Level Security

All tables have RLS enabled. Authenticated users can read all tickets, clients, and profiles. Users can only read/write their own color settings. File and ticket mutations are open to all authenticated users.

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
5. Update the CORS origin in `src/index.ts` to your GitHub Pages domain:
   ```ts
   origin: ["https://your-username.github.io"]
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
