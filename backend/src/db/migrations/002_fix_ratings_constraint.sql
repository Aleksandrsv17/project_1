-- BUG-017: Allow multiple ratings per booking (customer→vehicle AND chauffeur→customer)
-- Drop the booking_id-only unique constraint and replace with (booking_id, rater_id)

ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_booking_id_key;
ALTER TABLE ratings ADD CONSTRAINT ratings_booking_rater_unique UNIQUE (booking_id, rater_id);
