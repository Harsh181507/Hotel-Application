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
