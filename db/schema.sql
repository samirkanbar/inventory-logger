-- Inventory Logger schema. Safe to re-run (uses IF NOT EXISTS).

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
  -- price stored in integer cents to avoid float drift
  price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
  unit          TEXT,
  category      TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- For databases created before category existed:
ALTER TABLE items ADD COLUMN IF NOT EXISTS category TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS items_name_unique ON items (LOWER(name));

CREATE TABLE IF NOT EXISTS submissions (
  id            BIGSERIAL PRIMARY KEY,
  truck_id      BIGINT NOT NULL REFERENCES trucks(id) ON DELETE RESTRICT,
  title         TEXT NOT NULL,
  -- server-set on insert; the truck cannot tamper with this
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS submissions_truck_idx ON submissions (truck_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS submissions_date_idx ON submissions (submitted_at DESC);

CREATE TABLE IF NOT EXISTS submission_items (
  id            BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  item_id       BIGINT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  -- snapshot of the price at submission time so historical reports stay accurate
  -- if the admin later changes item prices.
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  item_name_snapshot TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS submission_items_submission_idx ON submission_items (submission_id);
