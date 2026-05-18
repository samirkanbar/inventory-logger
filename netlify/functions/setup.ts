// One-time setup endpoint. Run this once after the first deploy to:
//  1. Create the tables (idempotent — uses IF NOT EXISTS).
//  2. Seed the bootstrap admin from ADMIN_EMAIL / ADMIN_PASSWORD env vars.
//
// Protected by SETUP_TOKEN. Once an admin exists it refuses to seed again
// unless you also pass force=true (still requires the token).
//
// Usage:
//   curl -X POST https://<site>.netlify.app/api/setup \
//        -H "x-setup-token: $SETUP_TOKEN"

import { sql } from "./_lib/db";
import { hashPassword } from "./_lib/auth";
import { error, json, preflight } from "./_lib/http";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admins (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trucks (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
  unit          TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS items_name_unique ON items (LOWER(name));

CREATE TABLE IF NOT EXISTS submissions (
  id            BIGSERIAL PRIMARY KEY,
  truck_id      BIGINT NOT NULL REFERENCES trucks(id) ON DELETE RESTRICT,
  title         TEXT NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS submissions_truck_idx ON submissions (truck_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS submissions_date_idx ON submissions (submitted_at DESC);

CREATE TABLE IF NOT EXISTS submission_items (
  id            BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  item_id       BIGINT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  item_name_snapshot TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS submission_items_submission_idx ON submission_items (submission_id);
`;

export default async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return error("POST required", 405);

  const required = process.env.SETUP_TOKEN;
  if (!required) {
    return error("SETUP_TOKEN env var is not configured on the site", 500);
  }

  const supplied = req.headers.get("x-setup-token") || "";
  if (supplied !== required) return error("Invalid setup token", 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  const force = body?.force === true;

  // Split schema into statements and run them one by one (Neon HTTP driver
  // wants single statements).
  const statements = SCHEMA_SQL
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await sql(stmt);
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (!adminEmail || !adminPassword) {
    return json({
      ok: true,
      schema: "applied",
      admin: "skipped — set ADMIN_EMAIL and ADMIN_PASSWORD to seed",
    });
  }

  const existing = (await sql`SELECT COUNT(*)::int AS c FROM admins`) as Array<{ c: number }>;
  const adminCount = existing[0]?.c ?? 0;

  if (adminCount > 0 && !force) {
    return json({
      ok: true,
      schema: "applied",
      admin: `skipped — ${adminCount} admin(s) already exist. Pass {"force":true} to overwrite.`,
    });
  }

  const hash = await hashPassword(adminPassword);
  await sql`
    INSERT INTO admins (email, password_hash)
    VALUES (${adminEmail}, ${hash})
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `;

  return json({ ok: true, schema: "applied", admin: `seeded ${adminEmail}` });
};
