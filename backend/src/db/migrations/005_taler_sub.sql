-- Federated identity link for Taler ID OAuth login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS taler_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_taler_sub ON users(taler_sub) WHERE taler_sub IS NOT NULL;
