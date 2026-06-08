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

/** Driver taps Accept on a UID invite. */
export async function acceptUidInvite(userId: string, inviteId: string): Promise<{ companyId: string }> {
  // Reject if the user is already in a fleet (matches the code-redeem path).
  const u = await query<{ company_id: string | null }>(
    'SELECT company_id FROM users WHERE id = $1', [userId]
  );
  if (u.rows[0]?.company_id) {
    throw new ConflictError("You're already part of a fleet.");
  }

  const inv = await query<InviteRecord>(
    `SELECT * FROM company_invites WHERE id = $1`, [inviteId]
  );
  const invite = inv.rows[0];
  if (!invite) throw new NotFoundError('Invite');
  if (invite.used_at) throw new ConflictError('Invite already used');
  if (new Date(invite.expires_at) < new Date()) throw new ConflictError('Invite expired');
  if (invite.target_user_id !== userId) throw new AppError('This invite is not addressed to you', 403);

  await attachUserToCompany(userId, invite.company_id);
  await query(
    'UPDATE company_invites SET used_at = NOW(), used_by = $1 WHERE id = $2',
    [userId, invite.id]
  );
  return { companyId: invite.company_id };
}

/** Redeem an invite code (during register, or after for existing solo drivers). */
export async function redeemInviteByCode(userId: string, code: string): Promise<{ companyId: string }> {
  const u = await query<{ company_id: string | null }>(
    'SELECT company_id FROM users WHERE id = $1', [userId]
  );
  if (u.rows[0]?.company_id) {
    throw new ConflictError("You're already part of a fleet.");
  }
  const inv = await query<InviteRecord>(
    `SELECT * FROM company_invites WHERE code = $1`, [code.trim().toUpperCase()]
  );
  const invite = inv.rows[0];
  if (!invite) throw new NotFoundError('Invite code');
  if (invite.used_at) throw new ConflictError('Invite code already used');
  if (new Date(invite.expires_at) < new Date()) throw new ConflictError('Invite code expired');
  if (invite.target_user_id && invite.target_user_id !== userId) {
    throw new AppError('This invite is not addressed to you', 403);
  }

  await attachUserToCompany(userId, invite.company_id);
  await query(
    'UPDATE company_invites SET used_at = NOW(), used_by = $1 WHERE id = $2',
    [userId, invite.id]
  );
  return { companyId: invite.company_id };
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

/** ── Dashboard reads ─────────────────────────────────────────────────────── */

export async function listDrivers(companyId: string): Promise<unknown[]> {
  const res = await query<unknown>(
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

    // Load driver + (optional) company split shares.
    const dRes = await query<{
      company_id: string | null;
      driver_split_override: { driver_share?: number; company_share?: number } | null;
      default_driver_share: string | null;
      default_company_share: string | null;
    }>(
      `SELECT u.company_id, u.driver_split_override,
              c.default_driver_share, c.default_company_share
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [input.driverId]
    );
    const d = dRes.rows[0];
    if (!d) { logger.warn('Ledger skip — driver not found', { driverId: input.driverId }); return; }

    const platformRate = PLATFORM_RATE;
    const grossFare = round2(input.grossFare);
    const platformCut = round2(grossFare * platformRate);
    const netPool = round2(grossFare - platformCut);

    let driverShare: number;
    let companyShare: number;
    if (d.company_id) {
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
      d.company_id
        ? paymentProvider.payoutCompany({ companyId: d.company_id, bookingId: input.bookingId, amount: companyCut, currency })
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
        input.bookingId, input.driverId, d.company_id, currency,
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
