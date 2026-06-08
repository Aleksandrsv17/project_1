import { query } from '../../db';
import { logger } from '../../utils/logger';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../middleware/errorHandler';
import { paymentProvider } from '../payments/payment-provider';

/** Platform's cut of gross fare. Stored on each ledger row for traceability. */
export const PLATFORM_RATE = 0.15;

export interface CompanyRecord {
  id: string;
  legal_name: string;
  registration_number: string | null;
  vat_number: string | null;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  kyc_status: 'pending' | 'approved' | 'rejected';
  kyc_rejection_reason: string | null;
  default_driver_share: string;   // numeric -> string via pg
  default_company_share: string;
  payout_config: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterCompanyPayload {
  legal_name: string;
  registration_number?: string;
  vat_number?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

function generateInviteCode(): string {
  // 6-char alphanumeric, omit ambiguous chars (0/O/1/I).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** ── Company CRUD ─────────────────────────────────────────────────────────── */

export async function registerCompany(adminUserId: string, dto: RegisterCompanyPayload): Promise<CompanyRecord> {
  if (!dto.legal_name?.trim()) throw new ValidationError('legal_name is required');

  // A user can only admin / belong to ONE company.
  const existing = await query<{ company_id: string | null }>(
    'SELECT company_id FROM users WHERE id = $1', [adminUserId]
  );
  if (existing.rows[0]?.company_id) {
    throw new ConflictError("You're already part of a fleet.");
  }

  const inserted = await query<CompanyRecord>(
    `INSERT INTO companies
       (legal_name, registration_number, vat_number, address,
        contact_name, contact_phone, contact_email, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      dto.legal_name.trim(),
      dto.registration_number ?? null,
      dto.vat_number ?? null,
      dto.address ?? null,
      dto.contact_name ?? null,
      dto.contact_phone ?? null,
      dto.contact_email ?? null,
      adminUserId,
    ]
  );
  const company = inserted.rows[0];

  // Attach admin as company_admin (their company_membership_status stays NULL
  // because admins aren't drivers; if the user IS also a driver they get
  // is_driver=true via the existing register flow + can still drive for the
  // company they admin — only one company allowed).
  await query(
    `UPDATE users SET is_company_admin = true, company_id = $1, updated_at = NOW() WHERE id = $2`,
    [company.id, adminUserId]
  );

  return company;
}

export async function getCompanyByIdForUser(userId: string, companyId: string): Promise<CompanyRecord> {
  const res = await query<CompanyRecord & { is_company_admin: boolean; user_company_id: string | null }>(
    `SELECT c.*, u.is_company_admin, u.company_id AS user_company_id
     FROM companies c, users u
     WHERE c.id = $1 AND u.id = $2`,
    [companyId, userId]
  );
  const row = res.rows[0];
  if (!row) throw new NotFoundError('Company');
  if (row.user_company_id !== companyId) throw new AppError('Not your company', 403);
  return row;
}

export async function getCompanyForUser(userId: string): Promise<CompanyRecord | null> {
  const res = await query<CompanyRecord>(
    `SELECT c.* FROM companies c
     JOIN users u ON u.company_id = c.id
     WHERE u.id = $1`,
    [userId]
  );
  return res.rows[0] ?? null;
}

/** ── Invites ─────────────────────────────────────────────────────────────── */

export interface InviteRecord {
  id: string;
  company_id: string;
  target_user_id: string | null;
  code: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
}

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function createInvite(
  adminUserId: string,
  companyId: string,
  kind: 'uid' | 'code',
  targetUid?: string
): Promise<InviteRecord> {
  await assertIsCompanyAdmin(adminUserId, companyId);

  if (kind === 'uid' && !targetUid) {
    throw new ValidationError('target_uid is required for UID invites');
  }

  let targetUserId: string | null = null;
  if (kind === 'uid' && targetUid) {
    const found = await query<{ id: string; company_id: string | null }>(
      'SELECT id, company_id FROM users WHERE driver_uid = $1', [targetUid.trim()]
    );
    if (!found.rows[0]) throw new NotFoundError(`Driver UID ${targetUid}`);
    if (found.rows[0].company_id) {
      throw new ConflictError("This driver is already part of a fleet.");
    }
    targetUserId = found.rows[0].id;
  }

  // Generate unique code (retry on the extremely rare collision).
  let code = generateInviteCode();
  for (let i = 0; i < 5; i++) {
    const taken = await query('SELECT 1 FROM company_invites WHERE code = $1', [code]);
    if (taken.rowCount === 0) break;
    code = generateInviteCode();
  }

  const expires = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const inserted = await query<InviteRecord>(
    `INSERT INTO company_invites (company_id, target_user_id, code, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [companyId, targetUserId, code, expires, adminUserId]
  );
  return inserted.rows[0];
}

/** Driver taps Accept on a UID invite. Atomic claim — same race-safety as
 *  redeemInviteByCode. */
export async function acceptUidInvite(userId: string, inviteId: string): Promise<{ companyId: string }> {
  const u = await query<{ company_id: string | null }>(
    'SELECT company_id FROM users WHERE id = $1', [userId]
  );
  if (u.rows[0]?.company_id) {
    throw new ConflictError("You're already part of a fleet.");
  }
  const claim = await query<{ company_id: string }>(
    `UPDATE company_invites
        SET used_at = NOW(), used_by = $1
      WHERE id = $2
        AND used_at IS NULL
        AND expires_at > NOW()
        AND target_user_id = $1
      RETURNING company_id`,
    [userId, inviteId]
  );
  const claimed = claim.rows[0];
  if (!claimed) {
    const probe = await query<InviteRecord>('SELECT * FROM company_invites WHERE id = $1', [inviteId]);
    const inv = probe.rows[0];
    if (!inv) throw new NotFoundError('Invite');
    if (inv.used_at) throw new ConflictError('Invite already used');
    if (new Date(inv.expires_at) < new Date()) throw new ConflictError('Invite expired');
    throw new AppError('This invite is not addressed to you', 403);
  }
  await attachUserToCompany(userId, claimed.company_id);
  return { companyId: claimed.company_id };
}

/** Redeem an invite code (during register, or after for existing solo drivers).
 *  Race-safe: the WHERE clause is the entire validation (un-used, un-expired,
 *  targets-us-or-anyone), so two concurrent redemptions of the same code
 *  produce at most one success — the second one's UPDATE finds 0 rows and
 *  fails cleanly. */
export async function redeemInviteByCode(userId: string, code: string): Promise<{ companyId: string }> {
  const u = await query<{ company_id: string | null }>(
    'SELECT company_id FROM users WHERE id = $1', [userId]
  );
  if (u.rows[0]?.company_id) {
    throw new ConflictError("You're already part of a fleet.");
  }
  // Atomic claim: validates expiration, single-use, and target binding in
  // the same SQL statement that marks the invite as used.
  const claim = await query<{ id: string; company_id: string }>(
    `UPDATE company_invites
        SET used_at = NOW(), used_by = $1
      WHERE code = $2
        AND used_at IS NULL
        AND expires_at > NOW()
        AND (target_user_id IS NULL OR target_user_id = $1)
      RETURNING id, company_id`,
    [userId, code.trim().toUpperCase()]
  );
  const claimed = claim.rows[0];
  if (!claimed) {
    // Differentiate the failure: if a row exists but didn't claim, the
    // problem is used/expired/wrong-target; otherwise the code is unknown.
    const probe = await query<InviteRecord>('SELECT * FROM company_invites WHERE code = $1', [code.trim().toUpperCase()]);
    const inv = probe.rows[0];
    if (!inv) throw new NotFoundError('Invite code');
    if (inv.used_at) throw new ConflictError('Invite code already used');
    if (new Date(inv.expires_at) < new Date()) throw new ConflictError('Invite code expired');
    throw new AppError('This invite is not addressed to you', 403);
  }
  await attachUserToCompany(userId, claimed.company_id);
  return { companyId: claimed.company_id };
}

/** ── Fleet vehicles + assignments ───────────────────────────────────────── */

export async function listFleetVehicles(companyId: string): Promise<unknown[]> {
  const res = await query<any>(
    `SELECT v.*, a.driver_id AS assigned_driver_id,
            CASE WHEN a.driver_id IS NULL THEN NULL
                 ELSE concat_ws(' ', u.first_name, u.last_name) END AS assigned_driver_name,
            u.driver_uid AS assigned_driver_uid
     FROM fleet_vehicles v
     LEFT JOIN vehicle_assignments a ON a.vehicle_id = v.id
     LEFT JOIN users u ON u.id = a.driver_id
     WHERE v.company_id = $1 AND v.is_active = true
     ORDER BY v.created_at DESC`,
    [companyId]
  );
  return res.rows;
}

export async function addFleetVehicle(
  adminUserId: string, companyId: string,
  payload: { category: string; make: string; model: string; year?: number;
             license_plate: string; color?: string; assign_to_driver_id?: string }
): Promise<{ id: string }> {
  await assertIsCompanyAdmin(adminUserId, companyId);
  if (!payload.category || !payload.make || !payload.model || !payload.license_plate) {
    throw new ValidationError('category, make, model, license_plate are required');
  }
  const inserted = await query<{ id: string }>(
    `INSERT INTO fleet_vehicles
       (company_id, category, make, model, year, license_plate, color, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      companyId, payload.category, payload.make, payload.model, payload.year ?? null,
      payload.license_plate.trim().toUpperCase(), payload.color ?? null, adminUserId,
    ]
  );
  const vehicleId = inserted.rows[0].id;
  if (payload.assign_to_driver_id) {
    await assignVehicleToDriver(adminUserId, companyId, vehicleId, payload.assign_to_driver_id);
  }
  return { id: vehicleId };
}

export async function assignVehicleToDriver(
  adminUserId: string, companyId: string, vehicleId: string, driverId: string
): Promise<void> {
  await assertIsCompanyAdmin(adminUserId, companyId);
  // Both vehicle and driver must belong to this company.
  const v = await query<{ company_id: string }>(
    'SELECT company_id FROM fleet_vehicles WHERE id = $1', [vehicleId]
  );
  if (!v.rows[0] || v.rows[0].company_id !== companyId) throw new NotFoundError('Vehicle');
  const d = await query<{ company_id: string | null }>(
    'SELECT company_id FROM users WHERE id = $1', [driverId]
  );
  if (!d.rows[0] || d.rows[0].company_id !== companyId) throw new AppError('Driver not in this fleet', 422);
  // Sticky: overwrite any prior assignment for this vehicle.
  await query(
    `INSERT INTO vehicle_assignments (vehicle_id, driver_id, assigned_by)
     VALUES ($1,$2,$3)
     ON CONFLICT (vehicle_id) DO UPDATE
       SET driver_id = EXCLUDED.driver_id,
           assigned_by = EXCLUDED.assigned_by,
           assigned_at = NOW()`,
    [vehicleId, driverId, adminUserId]
  );
}

export async function unassignVehicle(
  adminUserId: string, companyId: string, vehicleId: string
): Promise<void> {
  await assertIsCompanyAdmin(adminUserId, companyId);
  const v = await query<{ company_id: string }>(
    'SELECT company_id FROM fleet_vehicles WHERE id = $1', [vehicleId]
  );
  if (!v.rows[0] || v.rows[0].company_id !== companyId) throw new NotFoundError('Vehicle');
  await query('DELETE FROM vehicle_assignments WHERE vehicle_id = $1', [vehicleId]);
}

/** Find the company that "owns" a ride. JOINs vehicle_assignments to confirm
 *  the driver is actually assigned to the vehicle — otherwise a fleet vehicle
 *  driven by someone outside the fleet (admin misconfig, stale state, even
 *  attacker spoofing vehicleId in driver:online) would have its company
 *  charged for a ride it never authorized. Returns NULL = solo. */
export async function resolveCompanyForBooking(
  driverId: string, vehicleId: string | null
): Promise<string | null> {
  if (!vehicleId) return null;
  const fv = await query<{ company_id: string }>(
    `SELECT v.company_id
       FROM fleet_vehicles v
       JOIN vehicle_assignments a ON a.vehicle_id = v.id
      WHERE v.id = $1 AND v.is_active = true AND a.driver_id = $2`,
    [vehicleId, driverId]
  );
  if (fv.rows[0]) return fv.rows[0].company_id;
  // Either not a fleet vehicle at all (solo) OR the driver isn't assigned
  // to it (we treat as solo for safety — the company isn't charged).
  return null;
}

/** ── Driver detail (admin viewing) ──────────────────────────────────────── */

export async function getDriverDetail(companyId: string, driverId: string): Promise<unknown> {
  const u = await query<any>(
    `SELECT u.id, u.driver_uid, u.first_name, u.last_name, u.email, u.phone,
            u.kyc_status, u.company_membership_status, u.driver_split_override,
            u.rating, u.rating_count, u.created_at
     FROM users u
     WHERE u.id = $1 AND u.company_id = $2`,
    [driverId, companyId]
  );
  if (!u.rows[0]) throw new NotFoundError('Driver');

  const assignedV = await query<any>(
    `SELECT v.* FROM fleet_vehicles v
     JOIN vehicle_assignments a ON a.vehicle_id = v.id
     WHERE a.driver_id = $1 AND v.company_id = $2`,
    [driverId, companyId]
  );

  const totals = await query<{ count: string; gross: string; driver: string; company: string; platform: string }>(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(gross_fare),0)  AS gross,
            COALESCE(SUM(driver_cut),0)  AS driver,
            COALESCE(SUM(company_cut),0) AS company,
            COALESCE(SUM(platform_cut),0) AS platform
     FROM ride_ledger WHERE driver_id = $1 AND company_id = $2`,
    [driverId, companyId]
  );
  const t = totals.rows[0];

  return {
    profile: u.rows[0],
    assigned_vehicles: assignedV.rows,
    totals: {
      rides: parseInt(t.count, 10) || 0,
      gross: Number(t.gross),
      driver_paid: Number(t.driver),
      company_cut: Number(t.company),
      platform_cut: Number(t.platform),
    },
  };
}

export async function listDriverRides(
  companyId: string, driverId: string, limit = 50
): Promise<unknown[]> {
  const res = await query<any>(
    `SELECT b.id AS booking_id, b.created_at, b.actual_end_time, b.status,
            b.pickup_address, b.pickup_lat, b.pickup_lng,
            b.dropoff_address, b.dropoff_lat, b.dropoff_lng,
            b.rating, b.customer_rating,
            l.gross_fare, l.platform_cut, l.company_cut, l.driver_cut,
            l.driver_share, l.company_share
     FROM bookings b
     LEFT JOIN ride_ledger l ON l.booking_id = b.id
     WHERE b.chauffeur_user_id = $1 AND b.company_id = $2
     ORDER BY b.created_at DESC
     LIMIT $3`,
    [driverId, companyId, limit]
  );
  return res.rows;
}

export async function setDriverSplitOverride(
  adminUserId: string, companyId: string, driverId: string,
  override: { driver_share: number; company_share: number } | null
): Promise<void> {
  await assertIsCompanyAdmin(adminUserId, companyId);
  if (override) {
    // Defence: NaN, Infinity, negatives, or > 1 individually all fail. A
    // negative cut would let a driver be paid MORE than gross fare, or
    // produce a negative company cut. We also re-validate the sum within
    // the same epsilon the schema CHECK uses on companies.default_*_share.
    const { driver_share, company_share } = override;
    if (!Number.isFinite(driver_share) || !Number.isFinite(company_share)
        || driver_share < 0 || driver_share > 1
        || company_share < 0 || company_share > 1) {
      throw new ValidationError('driver_share and company_share must be finite numbers in [0, 1]');
    }
    const sum = driver_share + company_share;
    if (Math.abs(sum - 1) > 0.0001) {
      throw new ValidationError('driver_share + company_share must sum to 1.0');
    }
  }
  await query(
    `UPDATE users SET driver_split_override = $1, updated_at = NOW()
     WHERE id = $2 AND company_id = $3`,
    [override ? JSON.stringify(override) : null, driverId, companyId]
  );
}

/** ── Invite list / revoke / my pending ──────────────────────────────────── */

export async function listInvitesForCompany(adminUserId: string, companyId: string): Promise<InviteRecord[]> {
  await assertIsCompanyAdmin(adminUserId, companyId);
  const res = await query<InviteRecord>(
    `SELECT * FROM company_invites
       WHERE company_id = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
    [companyId]
  );
  return res.rows;
}

export async function revokeInvite(adminUserId: string, companyId: string, inviteId: string): Promise<void> {
  await assertIsCompanyAdmin(adminUserId, companyId);
  // We mark the invite as used by the admin so the row stays auditable AND
  // can never be redeemed afterwards (the atomic UPDATE in redeem checks
  // used_at IS NULL).
  const del = await query(
    `UPDATE company_invites SET used_at = NOW(), used_by = $1
      WHERE id = $2 AND company_id = $3 AND used_at IS NULL`,
    [adminUserId, inviteId, companyId]
  );
  if (!del.rowCount) throw new NotFoundError('Invite');
}

/** Pending UID invites addressed to the current user (in-app inbox). */
export async function listMyPendingInvites(userId: string): Promise<Array<InviteRecord & { company_legal_name: string }>> {
  const res = await query<InviteRecord & { company_legal_name: string }>(
    `SELECT i.*, c.legal_name AS company_legal_name
       FROM company_invites i
       JOIN companies c ON c.id = i.company_id
      WHERE i.target_user_id = $1
        AND i.used_at IS NULL
        AND i.expires_at > NOW()
      ORDER BY i.created_at DESC`,
    [userId]
  );
  return res.rows;
}

/** ── Bersenev platform admin: approve / reject company KYC ──────────────── */

export async function reviewCompanyKyc(
  adminUserId: string, companyId: string, status: 'approved' | 'rejected', reason?: string
): Promise<void> {
  // Platform admin gate: must have role='admin' on the users table.
  const u = await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [adminUserId]);
  if (u.rows[0]?.role !== 'admin') {
    throw new AppError('Only Bersenev platform admins can review company KYC', 403);
  }
  if (status !== 'approved' && status !== 'rejected') {
    throw new ValidationError("status must be 'approved' or 'rejected'");
  }
  await query(
    `UPDATE companies
        SET kyc_status = $1,
            kyc_reviewed_at = NOW(),
            kyc_reviewed_by = $2,
            kyc_rejection_reason = $3,
            updated_at = NOW()
      WHERE id = $4`,
    [status, adminUserId, status === 'rejected' ? (reason ?? null) : null, companyId]
  );
}

/** ── Company KYC documents ──────────────────────────────────────────────── */

export async function addCompanyDocument(
  adminUserId: string, companyId: string,
  payload: { doc_type: string; file_url: string }
): Promise<{ id: string }> {
  await assertIsCompanyAdmin(adminUserId, companyId);
  if (!payload.doc_type || !payload.file_url) {
    throw new ValidationError('doc_type and file_url are required');
  }
  const valid = ['business_license','operating_permit','insurance','owner_id','other'];
  if (!valid.includes(payload.doc_type)) {
    throw new ValidationError(`doc_type must be one of ${valid.join(',')}`);
  }
  const ins = await query<{ id: string }>(
    `INSERT INTO company_documents (company_id, doc_type, file_url, uploaded_by)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [companyId, payload.doc_type, payload.file_url, adminUserId]
  );
  return { id: ins.rows[0].id };
}

export async function listCompanyDocuments(adminUserId: string, companyId: string): Promise<unknown[]> {
  await assertIsCompanyMember(adminUserId, companyId);
  const res = await query<any>(
    `SELECT * FROM company_documents WHERE company_id = $1 ORDER BY uploaded_at DESC`,
    [companyId]
  );
  return res.rows;
}

export async function removeDriverFromFleet(
  adminUserId: string, companyId: string, driverId: string
): Promise<void> {
  await assertIsCompanyAdmin(adminUserId, companyId);
  // Detach driver from any assignments + flip their membership status.
  // Historical rides keep their original company attribution (booking.company_id
  // already set; ledger rows immutable).
  await query('DELETE FROM vehicle_assignments WHERE driver_id = $1', [driverId]);
  await query(
    `UPDATE users SET company_id = NULL,
                      company_membership_status = 'removed',
                      driver_split_override = NULL,
                      updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [driverId, companyId]
  );
}

async function attachUserToCompany(userId: string, companyId: string): Promise<void> {
  // membership_status defaults to 'pending' until WE approve the driver's KYC.
  await query(
    `UPDATE users SET company_id = $1, is_driver = true,
                      company_membership_status = COALESCE(company_membership_status, 'pending'),
                      updated_at = NOW()
     WHERE id = $2`,
    [companyId, userId]
  );
}

async function assertIsCompanyAdmin(userId: string, companyId: string): Promise<void> {
  const res = await query<{ is_company_admin: boolean; company_id: string | null }>(
    'SELECT is_company_admin, company_id FROM users WHERE id = $1', [userId]
  );
  const u = res.rows[0];
  if (!u || !u.is_company_admin || u.company_id !== companyId) {
    throw new AppError('Forbidden — not the admin of this company', 403);
  }
}

/** Gate on simple fleet membership (admin OR driver). Used by read endpoints
 *  that expose roster-level data — drivers can see fellow drivers in their
 *  fleet but not financials. Mutations + financials still use the stricter
 *  admin gate above. */
export async function assertIsCompanyMember(userId: string, companyId: string): Promise<void> {
  const res = await query<{ company_id: string | null }>(
    'SELECT company_id FROM users WHERE id = $1', [userId]
  );
  if (!res.rows[0] || res.rows[0].company_id !== companyId) {
    throw new AppError('Forbidden — not a member of this company', 403);
  }
}

/** ── Dashboard reads ─────────────────────────────────────────────────────── */

export async function listDrivers(companyId: string): Promise<unknown[]> {
  const res = await query<any>(
    `SELECT u.id, u.driver_uid, u.first_name, u.last_name, u.email,
            u.kyc_status, u.company_membership_status, u.driver_split_override,
            (SELECT COALESCE(SUM(driver_cut),0) FROM ride_ledger
              WHERE driver_id = u.id AND company_id = $1) AS lifetime_driver_earnings
     FROM users u
     WHERE u.company_id = $1 AND u.is_driver = true
     ORDER BY u.created_at DESC`,
    [companyId]
  );
  return res.rows;
}

export async function companyEarnings(
  companyId: string, from?: string, to?: string
): Promise<{ total_rides: number; gross: number; platform: number; company: number; driver: number }> {
  const params: unknown[] = [companyId];
  let dateClause = '';
  if (from) { params.push(from); dateClause += ` AND created_at >= $${params.length}`; }
  if (to)   { params.push(to);   dateClause += ` AND created_at <= $${params.length}`; }
  const res = await query<{ count: string; gross: string; platform: string; company: string; driver: string }>(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(gross_fare),0)  AS gross,
            COALESCE(SUM(platform_cut),0) AS platform,
            COALESCE(SUM(company_cut),0)  AS company,
            COALESCE(SUM(driver_cut),0)   AS driver
     FROM ride_ledger
     WHERE company_id = $1${dateClause}`,
    params
  );
  const r = res.rows[0];
  return {
    total_rides: parseInt(r.count, 10) || 0,
    gross: Number(r.gross),
    platform: Number(r.platform),
    company: Number(r.company),
    driver: Number(r.driver),
  };
}

/** ── Ledger write (called from trip completion) ──────────────────────────── */

interface LedgerInput {
  bookingId: string;
  driverId: string;
  grossFare: number;
  currency?: string;
  customerId?: string;
}

export async function writeRideLedger(input: LedgerInput): Promise<void> {
  try {
    if (input.grossFare == null || input.grossFare <= 0) return;
    // Avoid double-writes on socket retries — booking_id is UNIQUE.
    const existing = await query<{ id: string }>('SELECT id FROM ride_ledger WHERE booking_id = $1', [input.bookingId]);
    if (existing.rowCount && existing.rowCount > 0) return;

    // Resolve company FROM THE BOOKING (not the driver) — the booking captured
    // company_id at ride-creation time based on the chosen vehicle. So a fleet
    // driver who chose their personal car for this ride gets bookings.company_id
    // = NULL (solo mode), and the ledger correctly omits the company cut.
    const bRes = await query<{ company_id: string | null }>(
      'SELECT company_id FROM bookings WHERE id = $1', [input.bookingId]
    );
    const bookingCompanyId = bRes.rows[0]?.company_id ?? null;

    // Load driver override + (optional) company default shares.
    const dRes = await query<{
      driver_split_override: { driver_share?: number; company_share?: number } | null;
      default_driver_share: string | null;
      default_company_share: string | null;
    }>(
      `SELECT u.driver_split_override,
              c.default_driver_share, c.default_company_share
       FROM users u
       LEFT JOIN companies c ON c.id = $2
       WHERE u.id = $1`,
      [input.driverId, bookingCompanyId]
    );
    const d = dRes.rows[0];
    if (!d) { logger.warn('Ledger skip — driver not found', { driverId: input.driverId }); return; }

    const platformRate = PLATFORM_RATE;
    const grossFare = round2(input.grossFare);
    const platformCut = round2(grossFare * platformRate);
    const netPool = round2(grossFare - platformCut);

    let driverShare: number;
    let companyShare: number;
    if (bookingCompanyId) {
      const override = d.driver_split_override;
      if (override?.driver_share != null && override?.company_share != null) {
        driverShare = Number(override.driver_share);
        companyShare = Number(override.company_share);
      } else {
        driverShare = Number(d.default_driver_share);
        companyShare = Number(d.default_company_share);
      }
    } else {
      driverShare = 1;
      companyShare = 0;
    }
    const driverCut = round2(netPool * driverShare);
    const companyCut = round2(netPool - driverCut); // prevent rounding drift

    // Fire payment-provider hooks (mock for now; idempotent refs).
    const currency = input.currency ?? 'EUR';
    const [collect, payDriver, payCompany] = await Promise.all([
      input.customerId
        ? paymentProvider.collectFare({ bookingId: input.bookingId, customerId: input.customerId, amount: grossFare, currency })
        : Promise.resolve({ ok: true, providerRef: null }),
      paymentProvider.payoutDriver({ driverId: input.driverId, bookingId: input.bookingId, amount: driverCut, currency }),
      bookingCompanyId
        ? paymentProvider.payoutCompany({ companyId: bookingCompanyId, bookingId: input.bookingId, amount: companyCut, currency })
        : Promise.resolve({ ok: true, providerRef: null }),
    ]);

    await query(
      `INSERT INTO ride_ledger
         (booking_id, driver_id, company_id, currency,
          gross_fare, platform_rate, platform_cut, net_pool,
          driver_share, company_share, driver_cut, company_cut,
          collect_ref, driver_payout_ref, company_payout_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        input.bookingId, input.driverId, bookingCompanyId, currency,
        grossFare, platformRate, platformCut, netPool,
        driverShare, companyShare, driverCut, companyCut,
        collect.providerRef, payDriver.providerRef, payCompany.providerRef,
      ]
    );
  } catch (err) {
    // Ledger failures must NEVER abort trip completion — log + move on.
    logger.error('Failed to write ride ledger', { bookingId: input.bookingId, error: err });
  }
}
