-- Two-way ratings. Ratings live on the booking (the canonical "ride") and the
-- per-user aggregate is denormalized onto users for fast display on match/profile.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rating INT;            -- customer -> driver (1..5)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS review TEXT;           -- customer -> driver note
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_rating INT;   -- driver -> customer (1..5)

ALTER TABLE users ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2);      -- avg of received ratings, NULL = "New"
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0;
