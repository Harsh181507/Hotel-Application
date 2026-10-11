-- Safe to run repeatedly: every statement is "IF NOT EXISTS".

CREATE TABLE IF NOT EXISTS hotels (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Front desk / admin logins.
CREATE TABLE IF NOT EXISTS staff (
  id             SERIAL PRIMARY KEY,
  hotel_id       INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'reception' CHECK (role IN ('admin', 'reception')),
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- qr_token is random and never changes, so the printed QR in the room stays valid.
CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  hotel_id    INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  number      TEXT NOT NULL,
  qr_token    TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, number)
);

-- One stay = one guest check-in. Guest logs in with guest_login + 6-digit code.
CREATE TABLE IF NOT EXISTS stays (
  id               SERIAL PRIMARY KEY,
  hotel_id         INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_id          INT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  guest_name       TEXT NOT NULL,
  guest_login      TEXT NOT NULL,
  code_hash        TEXT NOT NULL,
  -- Bumped whenever the code changes or the guest checks out, which
  -- invalidates every login token issued before.
  token_version    INT NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT true,
  failed_attempts  INT NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  checked_in_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at   TIMESTAMPTZ
);
-- At most one active guest per room.
CREATE UNIQUE INDEX IF NOT EXISTS stays_one_active_per_room ON stays (room_id) WHERE active;
CREATE INDEX IF NOT EXISTS stays_hotel_active ON stays (hotel_id) WHERE active;

-- Structured service requests (room cleaning, food order...) with a status.
CREATE TABLE IF NOT EXISTS requests (
  id          SERIAL PRIMARY KEY,
  hotel_id    INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  stay_id     INT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('housekeeping', 'food', 'maintenance', 'amenities', 'other')),
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS requests_hotel_status ON requests (hotel_id, status);

-- Chat messages between a guest (stay) and the front desk.
CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  stay_id     INT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
  sender      TEXT NOT NULL CHECK (sender IN ('guest', 'staff', 'system')),
  staff_id    INT REFERENCES staff(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  request_id  INT REFERENCES requests(id) ON DELETE SET NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_stay_id ON messages (stay_id, id DESC);
CREATE INDEX IF NOT EXISTS messages_unread ON messages (stay_id) WHERE read_at IS NULL;

-- The "local answers" section: Wi-Fi password, nearby places, timings...
CREATE TABLE IF NOT EXISTS faqs (
  id          SERIAL PRIMARY KEY,
  hotel_id    INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'General',
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faqs_hotel ON faqs (hotel_id, sort_order);

-- =====================================================================
-- v2: autopilot, departments, in-room ordering, housekeeping.
-- Written so it upgrades an existing database in place (safe to re-run).
-- =====================================================================

-- Hotel settings
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS autopilot_mode TEXT NOT NULL DEFAULT 'always';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS night_start TEXT NOT NULL DEFAULT '22:00';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS night_end TEXT NOT NULL DEFAULT '07:00';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS escalate_after_minutes INT NOT NULL DEFAULT 10;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS require_inspection BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hotels DROP CONSTRAINT IF EXISTS hotels_autopilot_mode_check;
ALTER TABLE hotels ADD CONSTRAINT hotels_autopilot_mode_check CHECK (autopilot_mode IN ('always', 'night', 'off'));

-- Staff roles: desk roles + department roles
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('admin', 'reception', 'housekeeping', 'kitchen', 'maintenance'));
-- Floors a housekeeper looks after, e.g. "1,2" (used for automatic room assignment)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS floors TEXT NOT NULL DEFAULT '';

-- Messages can now also come from the autopilot ("bot")
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_check CHECK (sender IN ('guest', 'staff', 'system', 'bot'));

-- Extra words that should match an answer, e.g. "internet, net, वाईफाई"
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT '';

-- Requests are routed to a department and can be accepted by a staff member
ALTER TABLE requests ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'reception';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS assigned_to INT REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
UPDATE requests SET department = CASE type
    WHEN 'housekeeping' THEN 'housekeeping' WHEN 'amenities' THEN 'housekeeping'
    WHEN 'food' THEN 'kitchen' WHEN 'maintenance' THEN 'maintenance' ELSE 'reception' END
  WHERE department = 'reception' AND type <> 'other';
CREATE INDEX IF NOT EXISTS requests_hotel_dept_status ON requests (hotel_id, department, status);

-- Housekeeping status per room
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hk_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hk_priority BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hk_note TEXT NOT NULL DEFAULT '';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hk_assigned_to INT REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hk_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS dnd BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_hk_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_hk_status_check CHECK (hk_status IN ('dirty', 'cleaning', 'inspect', 'ready'));
-- Rooms never stay assigned to someone who left or changed job
UPDATE rooms r SET hk_assigned_to = NULL FROM staff st
  WHERE st.id = r.hk_assigned_to AND (NOT st.active OR st.role <> 'housekeeping');
-- Floor from the room number: 105 -> 1, 1203 -> 12
UPDATE rooms SET floor = CASE WHEN number ~ '^[0-9]{3,}$' THEN left(number, length(number) - 2) ELSE '' END
  WHERE floor IS NULL;

-- Uploaded pictures (menu photos), kept in the database so no paid storage is needed
CREATE TABLE IF NOT EXISTS images (
  id          SERIAL PRIMARY KEY,
  hotel_id    INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In-room dining menu. Prices are stored in paise (₹1 = 100) to avoid rounding errors.
CREATE TABLE IF NOT EXISTS menu_items (
  id           SERIAL PRIMARY KEY,
  hotel_id     INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  category     TEXT NOT NULL DEFAULT 'Food',
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_paise  INT NOT NULL CHECK (price_paise >= 0),
  image_id     INT REFERENCES images(id) ON DELETE SET NULL,
  veg          BOOLEAN NOT NULL DEFAULT true,
  popular      BOOLEAN NOT NULL DEFAULT false,
  available    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_items_hotel ON menu_items (hotel_id, sort_order);

CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  hotel_id      INT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  stay_id       INT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'placed'
                CHECK (status IN ('placed', 'preparing', 'on_the_way', 'delivered', 'cancelled')),
  note          TEXT NOT NULL DEFAULT '',
  total_paise   INT NOT NULL,
  escalated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_hotel_status ON orders (hotel_id, status);
CREATE INDEX IF NOT EXISTS orders_stay ON orders (stay_id);

-- Each line keeps the name and price at the time of ordering, so later menu
-- edits never change an old bill.
CREATE TABLE IF NOT EXISTS order_items (
  id                SERIAL PRIMARY KEY,
  order_id          INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id      INT REFERENCES menu_items(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  unit_price_paise  INT NOT NULL,
  quantity          INT NOT NULL CHECK (quantity BETWEEN 1 AND 50)
);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items (order_id);
