# Inventory Logger

Two-faced inventory tracker for a cafe-truck fleet.

- **Truck side**: simple search + tap-the-card flow. Pick item → enter quantity → review → confirm submit. Date is set by the server, trucks cannot tamper with it.
- **Admin side**: upload a price sheet, manage trucks (one login per truck), see every submission, drill in, and download each as an Excel file with line items + prices + totals.

Built for Netlify: Vite SPA + Netlify Functions + Netlify DB (Neon Postgres).

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Provision Netlify DB

In your Netlify project: **Project → Integrations → Database → Netlify DB**. After it's created, copy the connection string Netlify gives you.

### 3. Environment variables

Copy `.env.example` to `.env` and fill in:

```
DATABASE_URL=postgresql://...          # from Netlify DB
JWT_SECRET=...                         # openssl rand -base64 48
ADMIN_EMAIL=you@example.com            # only used by seed script
ADMIN_PASSWORD=...
```

Add `DATABASE_URL` and `JWT_SECRET` to your Netlify site as well (**Site configuration → Environment variables**) for production.

### 4. Initialize the database

```bash
npm run db:init          # create tables
npm run db:seed-admin    # creates/updates the admin from ADMIN_EMAIL/ADMIN_PASSWORD
```

### 5. Develop

```bash
npm run dev              # Netlify Dev — serves SPA + functions at http://localhost:8888
```

(If you don't have the Netlify CLI: `npm i -g netlify-cli`.)

### 6. Deploy

Push to your Netlify-connected repo, or `netlify deploy --prod`. `netlify.toml` already declares the build, publish directory, and the `/api/*` → functions rewrite.

---

## Using it

### Admin first run
1. Log in as admin.
2. Go to **Items**, upload a price sheet (`.csv` or `.xlsx`). Required columns: `name`, `price`. Optional: `unit`.
   - Example row: `2% milk, 5.00, gallon`
   - "Replace mode" deactivates items not present in the upload.
3. Go to **Trucks**, create one account per truck (e.g. `truck-42` / `Truck 42`).

### Truck side
1. Log in with the truck username + password the admin created.
2. Search or scroll the card list.
3. Tap a card → enter quantity → it goes into the cart.
4. Tap **Review & submit** → add a title → **Confirm & submit**.
5. The server timestamps it on insert. That timestamp is what the admin sees.

### Admin reviewing
- **Submissions** lists every submission with truck, title, date, total qty, and total $.
- Filter by truck via the dropdown.
- Click a submission for a full breakdown.
- **Excel** button downloads an `.xlsx` per submission with title, truck, submitted date, every line item, unit price, line total, and grand total.

---

## Architecture

```
inventory-logger/
├── netlify/functions/        Netlify Functions (TypeScript)
│   ├── _lib/                 Shared: db client, JWT/bcrypt, HTTP helpers
│   ├── login.ts              POST  /api/login        — admin or truck
│   ├── me.ts                 GET   /api/me           — verify token
│   ├── items.ts              GET/POST/PATCH /api/items
│   ├── trucks.ts             GET/POST/PATCH /api/trucks (admin only)
│   ├── submissions.ts        GET/POST /api/submissions
│   └── export.ts             GET   /api/export?id=…  — xlsx download
├── db/schema.sql             Tables: admins, trucks, items, submissions, submission_items
├── scripts/                  db-init.mjs, seed-admin.mjs
└── src/                      React + Vite SPA
    ├── App.tsx               Role-based router
    ├── auth.tsx              AuthContext (JWT in localStorage)
    ├── api.ts                fetch wrapper + file download helper
    ├── pages/                Login, TruckHome, AdminLayout, AdminSubmissions,
    │                         AdminSubmissionDetail, AdminItems, AdminTrucks
    └── components/           QuantityModal, ConfirmSubmitModal
```

### Why prices live on `submission_items`

When the admin updates a price (e.g. milk goes from $5 → $6), old submissions must still show what milk cost the day they were submitted. Each submission row snapshots the unit price and the item name at insert time, so historical reports stay accurate regardless of later price changes.

### Why the truck can't tamper with the date

The `submissions.submitted_at` column has `DEFAULT NOW()` and is not accepted in the insert. Only the server (Postgres) decides what time it was. The admin always sees the real server timestamp.

---

## Security notes

- Passwords hashed with bcrypt (cost 12).
- JWTs signed with `JWT_SECRET` (HS256), 30-day expiry, stored in `localStorage`. Replace `JWT_SECRET` to invalidate all sessions.
- API routes check role server-side: `POST /api/submissions` rejects admins, mutating items/trucks routes reject trucks.
- Trucks can only fetch their own submissions; admins see all.
