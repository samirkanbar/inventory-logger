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

-- Join table: which trucks can submit which items.
CREATE TABLE IF NOT EXISTS truck_items (
  truck_id BIGINT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  item_id  BIGINT NOT NULL REFERENCES items(id)  ON DELETE CASCADE,
  PRIMARY KEY (truck_id, item_id)
);
CREATE INDEX IF NOT EXISTS truck_items_truck_idx ON truck_items (truck_id);
CREATE INDEX IF NOT EXISTS truck_items_item_idx  ON truck_items (item_id);

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

-- Item requests: a truck flags something it's missing. The request is EITHER a
-- pointer to an existing catalog item (item_id) OR a free-text custom name
-- (e.g. "cupcakes") for something not in the catalog yet.
CREATE TABLE IF NOT EXISTS requests (
  id          BIGSERIAL PRIMARY KEY,
  truck_id    BIGINT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  -- nullable: a custom (non-catalog) request has no item_id.
  item_id     BIGINT REFERENCES items(id) ON DELETE SET NULL,
  custom_name TEXT,
  quantity    INTEGER CHECK (quantity IS NULL OR quantity > 0),
  note        TEXT,
  -- 'open' for now; a future "resolve" action will flip this to 'resolved'.
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- every request must name something: a catalog item or a custom string.
  CONSTRAINT requests_item_or_custom CHECK (item_id IS NOT NULL OR custom_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS requests_created_idx ON requests (created_at DESC);
CREATE INDEX IF NOT EXISTS requests_truck_idx ON requests (truck_id, created_at DESC);

-- Expo push notification tokens. user_id is polymorphic: it points at admins.id
-- or trucks.id depending on `role`, so it can't be a single FK. One row per device.
CREATE TABLE IF NOT EXISTS push_tokens (
  id          BIGSERIAL PRIMARY KEY,
  role        TEXT NOT NULL,
  user_id     BIGINT NOT NULL,
  expo_token  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_tokens_role_idx ON push_tokens (role);
