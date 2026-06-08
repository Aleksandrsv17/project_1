-- 008_fleet_vehicles.sql — fleet-owned vehicles + sticky driver assignments
-- + bookings.company_id captured at ride-creation time.

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Same category vocabulary as the driver-owned vehicles (sclass/maybach/vclass).
  category        text NOT NULL,
  make            text NOT NULL,
  model           text NOT NULL,
  year            integer,
  license_plate   text NOT NULL,
  color           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_company ON fleet_vehicles(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_vehicles_company_plate ON fleet_vehicles(company_id, license_plate);

-- ── vehicle_assignments — sticky driver↔vehicle binding ────────────────────────
-- Single-row-per-vehicle current assignment. Sticky: only changed by an admin
-- explicit Change/Unassign call. NEVER auto-rotated on shift end / offline /
-- logout / KYC revoke.
CREATE TABLE IF NOT EXISTS vehicle_assignments (
  vehicle_id      uuid PRIMARY KEY REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  driver_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by     uuid,
  assigned_at     timestamptz NOT NULL DEFAULT NOW(),
  -- A driver can be assigned to multiple vehicles (e.g. backup), but each
  -- vehicle has exactly one current driver.
  CONSTRAINT vehicle_assignments_driver_company_match
    CHECK (true) -- runtime check in code (driver.company_id must match vehicle.company_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_driver ON vehicle_assignments(driver_id);

-- ── bookings.company_id — captured at ride-creation time ──────────────────────
-- Set when the ride is created based on the driver's chosen vehicle's
-- company. NULL = solo. The ledger reads from here (NOT from the driver's
-- current company), so historical attribution stays correct even if the
-- driver later leaves / joins a different fleet.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS company_id  uuid REFERENCES companies(id);

CREATE INDEX IF NOT EXISTS idx_bookings_company_id ON bookings(company_id);

-- ── ledger correction: backfill rows from bookings (no-op for new rows) ──────
-- (No data migration needed — existing rides have NULL company_id and the
-- ledger rows already-written use the old user-company mapping. Going forward,
-- writeRideLedger reads from bookings.company_id, so each future row is
-- correctly attributed even when a driver later switches.)

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Migrations run as postgres but the app connects as vip_user. Without these
-- the app gets 'permission denied for table companies' (PG 42501). Includes
-- the 007 tables too since they had the same gap.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  companies, company_invites, company_documents,
  fleet_vehicles, vehicle_assignments, ride_ledger
TO vip_user;
