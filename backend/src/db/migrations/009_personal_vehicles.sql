-- 009_personal_vehicles.sql — driver-owned personal vehicles synced to the
-- server so the same driver account sees the same garage across devices.
-- Replaces the per-device SecureStore-only storage. Solo + fleet drivers
-- both use this for their personal cars; fleet-assigned cars stay in the
-- existing vehicle_assignments path.

CREATE TABLE IF NOT EXISTS driver_personal_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category        text NOT NULL,
  make            text NOT NULL,
  model           text NOT NULL,
  year            integer,
  license_plate   text NOT NULL,
  color           text,
  is_active       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpv_user ON driver_personal_vehicles(user_id);

-- Only ONE active vehicle per user. The setActive flow flips others to
-- inactive in a single transaction; this partial unique index is the
-- belt-and-suspenders database guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dpv_user_active
  ON driver_personal_vehicles(user_id)
  WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE driver_personal_vehicles TO vip_user;
