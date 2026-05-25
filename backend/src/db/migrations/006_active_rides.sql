-- Durable store for in-progress rides so they survive a backend restart/crash.
-- The full ActiveRideRecord lives in `record` (jsonb); the scalar columns are
-- just for querying. Ephemeral socket ids are nulled on reload.
CREATE TABLE IF NOT EXISTS active_rides (
  ride_id     UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  driver_id   UUID NOT NULL,
  status      TEXT NOT NULL,
  record      JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_active_rides_customer ON active_rides(customer_id);
CREATE INDEX IF NOT EXISTS idx_active_rides_driver ON active_rides(driver_id);
