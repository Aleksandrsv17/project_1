-- 007_companies.sql — fleet/company accounts, invites, ride ledger
--
-- Adds the Company / Fleet feature: a company admin can register a company
-- (subject to Bersenev KYC approval), invite drivers either by UID or by
-- code/link, and earn a configurable share of each completed ride. Every
-- completed ride writes an immutable ledger row.

-- ── 1. companies ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name               text NOT NULL,
  registration_number      text,
  vat_number               text,
  address                  text,
  contact_name             text,
  contact_phone            text,
  contact_email            text,

  -- KYC review by Bersenev platform admin.
  kyc_status               text NOT NULL DEFAULT 'pending'
                             CHECK (kyc_status IN ('pending','approved','rejected')),
  kyc_reviewed_at          timestamptz,
  kyc_reviewed_by          uuid,
  kyc_rejection_reason     text,

  -- Shares of the NET pool (after the 15% platform cut). Both default values
  -- sum to 1.0. Stored as shares-of-net so changing the platform rate later
  -- doesn't break every company's config.
  default_driver_share     numeric(5,4) NOT NULL DEFAULT 0.8824,
  default_company_share    numeric(5,4) NOT NULL DEFAULT 0.1176,
  CONSTRAINT companies_default_shares_sum_to_one
    CHECK (abs(default_driver_share + default_company_share - 1.0) < 0.0001),

  -- Provider-agnostic payout configuration. Schema is provider-specific
  -- (Stripe Connect account id, IBAN for SEPA, etc.) — JSONB lets us swap
  -- providers without a migration.
  payout_config            jsonb,

  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT NOW(),
  updated_at               timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_kyc_status ON companies(kyc_status);

-- ── 2. company_documents (KYC uploads) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type       text NOT NULL
                   CHECK (doc_type IN ('business_license','operating_permit','insurance','owner_id','other')),
  file_url       text NOT NULL,
  uploaded_by    uuid,
  uploaded_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_documents_company ON company_documents(company_id);

-- ── 3. users: company + role flags ─────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_company_admin           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_driver                  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_id                 uuid REFERENCES companies(id) ON DELETE SET NULL,
  -- Driver membership status within the company. 'pending' until WE approve
  -- the driver's KYC; 'active' once approved; 'removed' if the company
  -- removed them. Historical rides keep their original attribution regardless.
  ADD COLUMN IF NOT EXISTS company_membership_status  text
                            CHECK (company_membership_status IN ('pending','active','removed')),
  -- Per-driver override of the company default split (shares-of-net JSON
  -- {"driver_share": x, "company_share": y}); NULL => use company default.
  ADD COLUMN IF NOT EXISTS driver_split_override      jsonb;

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- ── 4. company_invites ─────────────────────────────────────────────────────────
-- Two kinds: by-UID (target_user_id set) or by-code/link (target_user_id NULL).
-- Single-use: used_at is set on redemption.
CREATE TABLE IF NOT EXISTS company_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_user_id  uuid REFERENCES users(id),
  code            text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  used_by         uuid REFERENCES users(id),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_invites_company ON company_invites(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invites_target_user ON company_invites(target_user_id)
  WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_invites_open ON company_invites(code)
  WHERE used_at IS NULL;

-- ── 5. ride_ledger (immutable per-ride split record) ───────────────────────────
CREATE TABLE IF NOT EXISTS ride_ledger (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL REFERENCES users(id),
  company_id        uuid REFERENCES companies(id), -- NULL for solo drivers
  currency          text NOT NULL DEFAULT 'EUR',

  gross_fare        numeric(12,2) NOT NULL,
  platform_rate     numeric(5,4)  NOT NULL,   -- rate applied at the moment of this ledger row
  platform_cut      numeric(12,2) NOT NULL,
  net_pool          numeric(12,2) NOT NULL,
  driver_share      numeric(5,4)  NOT NULL,   -- share of net pool (1.0 for solo)
  company_share     numeric(5,4)  NOT NULL,   -- share of net pool (0.0 for solo)
  driver_cut        numeric(12,2) NOT NULL,
  company_cut       numeric(12,2) NOT NULL,

  -- Provider refs for traceability (mock provider returns synthetic strings).
  collect_ref       text,
  driver_payout_ref text,
  company_payout_ref text,

  created_at        timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_ledger_driver_id    ON ride_ledger(driver_id);
CREATE INDEX IF NOT EXISTS idx_ride_ledger_company_id   ON ride_ledger(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ride_ledger_created_at   ON ride_ledger(created_at);
