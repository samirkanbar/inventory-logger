# Inventory Logger

A two-sided inventory ordering app for a multi-location business — a mix of trucks, cafes, or any other spot that needs to send a daily/shift order back to whoever owns the supply.

## What it does

Each **location** (truck, cafe, kiosk — anything you give a login to) sees only the items its admin assigned to it. Staff tap items, set quantities, and submit an order. The boss sees every order in real time, with a server-stamped timestamp the staff can't fake. Old orders are price-locked: changing a price today doesn't rewrite yesterday's totals.

### Location side (mobile-first)
- Sign in with the username + password the admin issued.
- Items are grouped by category in collapsible sections with color-coded headers (browns/ambers, deterministic by index).
- Tap **+ Add** on an item, then use the inline `−` / `+` stepper to set quantity. Or type a number directly.
- A search bar across the top filters live; while searching, all categories auto-expand.
- A sticky footer shows total items and total quantity in the cart. **Review & submit** opens a confirmation modal — give the order a title, review the lines, hit Confirm.
- On success, a modal pops up that you have to dismiss explicitly (no auto-dismiss) so it's obvious the submit landed.

### Admin side (desktop-friendly)
- **Submissions**: every order from every location, filterable by location. Click in to see line items with unit price + line total + grand total. Download any single submission as a formatted `.xlsx`.
- **Items**: upload a `.csv` / `.xlsx` (columns: `name`, `price`, optional `unit` and `category`), pick which locations the items apply to, optionally use Replace mode to un-assign anything not in the file. Once items exist, you can:
  - **Click any name, unit, or price to edit it inline.** Enter saves, Esc cancels, click-away saves. This is the ad-hoc fix for "milk just went up 50¢" without re-uploading a sheet.
  - Click the category pill to change a single item's category.
  - Click the assignment chip to change which locations see that item.
  - Activate / deactivate individual items.
- **Locations** (formerly "Trucks" — the table heading still uses Truck internally for the role): create accounts (display name + lowercase username + password ≥ 6 chars), reset passwords, deactivate accounts.
- **Admins**: create additional admin accounts (email + password), reset any admin's password, remove other admins. You can't delete yourself, and you can't delete the last admin.

### What's actually protected
- Passwords are bcrypt-hashed at cost 12. They never leave the server in plaintext after the initial create/reset.
- Sessions are JWTs (HS256, 30-day expiry) in `localStorage`. Rotate `JWT_SECRET` to invalidate every session at once.
- Every API route checks role server-side. Locations can only read their own submissions; only admins can mutate items, locations, or other admins.
- `submissions.submitted_at` is `DEFAULT NOW()` and rejected from the insert payload — Postgres alone decides the timestamp.
- `submission_items` snapshots the unit price + item name at submission time, so a later price change can't rewrite history.

---

## Stack

- **Frontend**: Vite + React 18 + Tailwind v4, SPA.
- **Backend**: Netlify Functions (TypeScript, esbuild bundler).
- **DB**: Netlify DB (Neon serverless Postgres) over the `@neondatabase/serverless` HTTP driver.
- **Hosting**: Netlify, with `/api/*` rewritten to `/.netlify/functions/*` in `netlify.toml`.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Provision Netlify DB

In your Netlify project: **Integrations → Database → Netlify DB**. Copy the connection string.

### 3. Environment variables

Copy `.env.example` to `.env`:

```
DATABASE_URL=postgresql://...          # from Netlify DB
JWT_SECRET=...                         # openssl rand -base64 48
ADMIN_EMAIL=you@example.com            # seeded as the first admin
ADMIN_PASSWORD=...
SETUP_TOKEN=...                        # any random string; protects /api/setup
```

Add all of these to your Netlify site as well (**Site configuration → Environment variables**).

### 4. Initialize the database

You have two equivalent paths. The local script needs a working `DATABASE_URL` from your laptop:

```bash
npm run db:init           # create tables
npm run db:seed-admin     # seed first admin from ADMIN_EMAIL / ADMIN_PASSWORD
```

Or, after the site is deployed, hit the `/api/setup` endpoint once with your `SETUP_TOKEN`:

```bash
curl -X POST https://<your-site>.netlify.app/api/setup \
     -H "x-setup-token: $SETUP_TOKEN"
```

The endpoint is idempotent for schema (`CREATE TABLE IF NOT EXISTS`) and refuses to overwrite an existing admin unless you pass `{"force":true}` in the body.

### 5. Develop locally

```bash
npm run dev               # Netlify Dev: SPA + functions at http://localhost:8888
```

Requires the Netlify CLI (`npm i -g netlify-cli`).

### 6. Deploy

Push to the connected branch, or `netlify deploy --prod`. `netlify.toml` already declares the build, publish dir, and `/api/*` rewrite.

After deploy, add your first admin (and additional locations) through the admin UI — no more SQL needed.

---

## Architecture

```
inventory-logger/
├── netlify/functions/        Netlify Functions (TypeScript)
│   ├── _lib/                 Shared: db client, JWT/bcrypt, HTTP helpers
│   ├── login.ts              POST  /api/login        — admin or truck (location) role
│   ├── me.ts                 GET   /api/me           — verify token, return current user
│   ├── setup.ts              POST  /api/setup        — one-time schema + admin seed
│   ├── items.ts              GET/POST/PATCH /api/items     — list, bulk-import, edit
│   ├── trucks.ts             GET/POST/PATCH /api/trucks    — location accounts (admin only)
│   ├── admins.ts             GET/POST/PATCH/DELETE /api/admins — admin accounts (admin only)
│   ├── submissions.ts        GET/POST /api/submissions
│   └── export.ts             GET   /api/export?id=…  — single-submission .xlsx download
├── db/schema.sql             Mirror of the setup.ts schema
├── scripts/                  db-init.mjs, seed-admin.mjs (local CLI alternatives to /api/setup)
└── src/                      React + Vite SPA
    ├── App.tsx               Role-based router (admin / truck / login)
    ├── auth.tsx              AuthContext (JWT in localStorage)
    ├── api.ts                fetch wrapper + file-download helper
    ├── categories.ts         category palette + grouping helpers
    ├── money.ts              cents ↔ formatted USD ↔ parse helpers
    ├── pages/
    │   ├── Login.tsx
    │   ├── TruckHome.tsx           (Location-side ordering UI)
    │   ├── AdminLayout.tsx         (nav + shell)
    │   ├── AdminSubmissions.tsx
    │   ├── AdminSubmissionDetail.tsx
    │   ├── AdminItems.tsx          (upload + inline edit name/price/unit)
    │   ├── AdminTrucks.tsx         (locations management)
    │   └── AdminAdmins.tsx         (admin-account management)
    └── components/           QuantityModal, ConfirmSubmitModal
```

### Why prices snapshot on `submission_items`

When the admin updates a price (e.g. milk goes from $5 → $6), old submissions must still show what milk cost the day they were submitted. Each `submission_items` row stores the unit price and item name at insert time, so historical reports stay accurate regardless of later edits.

### Why the location can't tamper with the date

The `submissions.submitted_at` column has `DEFAULT NOW()` and is not accepted in the insert payload. Only the server (Postgres) decides what time it was. The admin always sees the real server timestamp.

### Note on "truck" vs "location" terminology

The schema and API still call the per-location accounts `trucks` (table, function, role string). The UI was renamed to "Location" throughout the login flow because not every spot is a truck — some are cafes. The internal name is kept to avoid a destructive migration on a live DB.
