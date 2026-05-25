-- Link dispatched rides to the driver (users.id) so they appear in the driver's
-- history + earnings even when vehicle_id is null (Bersenev local vehicles).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS chauffeur_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_chauffeur_user_id ON bookings(chauffeur_user_id);
