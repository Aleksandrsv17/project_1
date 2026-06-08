import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { query } from '../../db';
import {
  registerCompany, getCompanyForUser, createInvite,
  acceptUidInvite, redeemInviteByCode, listDrivers, companyEarnings,
  listFleetVehicles, addFleetVehicle, assignVehicleToDriver, unassignVehicle,
  getDriverDetail, listDriverRides, setDriverSplitOverride, removeDriverFromFleet,
  assertIsCompanyMember,
} from './company.service';

import { query as q } from '../../db';

/** Tiny admin gate at the controller layer — used by handlers that don't
 *  otherwise call a service method whose mutation path already asserts admin
 *  (e.g. earnings / per-driver rides which are admin-only reads). */
async function assertAdmin(userId: string, companyId: string): Promise<void> {
  const res = await q<{ is_company_admin: boolean; company_id: string | null }>(
    'SELECT is_company_admin, company_id FROM users WHERE id = $1', [userId]
  );
  const u = res.rows[0];
  if (!u || !u.is_company_admin || u.company_id !== companyId) {
    const e = new Error('Forbidden — not the admin of this company') as Error & { statusCode: number };
    e.statusCode = 403;
    throw e;
  }
}

function uid(req: Request): string { return (req as AuthenticatedRequest).user.sub; }

class CompanyController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const company = await registerCompany(uid(req), req.body ?? {});
      res.status(201).json({ success: true, data: { company } });
    } catch (e) { next(e); }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = uid(req);
      const company = await getCompanyForUser(userId);
      // Surface whether this user is the company admin so the client can show
      // / hide the Fleet tab + invite-creation UI without an extra round trip.
      const flagRes = await query<{ is_company_admin: boolean }>(
        'SELECT is_company_admin FROM users WHERE id = $1', [userId]
      );
      const is_admin = !!flagRes.rows[0]?.is_company_admin;
      res.json({ success: true, data: { company, is_admin } });
    } catch (e) { next(e); }
  }

  async createInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { kind, target_uid } = req.body ?? {};
      const invite = await createInvite(uid(req), req.params.id, kind, target_uid);
      res.status(201).json({ success: true, data: { invite } });
    } catch (e) { next(e); }
  }

  async acceptInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { invite_id } = req.body ?? {};
      const result = await acceptUidInvite(uid(req), invite_id);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }

  async redeemCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code } = req.body ?? {};
      if (!code) { res.status(422).json({ success: false, error: { message: 'code required' } }); return; }
      const result = await redeemInviteByCode(uid(req), code);
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  }

  async drivers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Member gate: drivers can see fellow drivers in their fleet.
      await assertIsCompanyMember(uid(req), req.params.id);
      const drivers = await listDrivers(req.params.id);
      res.json({ success: true, data: { drivers } });
    } catch (e) { next(e); }
  }

  async earnings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Admin-only: only the company admin sees company-wide financials.
      await assertAdmin(uid(req), req.params.id);
      const from = req.query.from ? String(req.query.from) : undefined;
      const to = req.query.to ? String(req.query.to) : undefined;
      const summary = await companyEarnings(req.params.id, from, to);
      res.json({ success: true, data: summary });
    } catch (e) { next(e); }
  }

  // ── Vehicles ──────────────────────────────────────────────────────────────
  async listVehicles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await assertIsCompanyMember(uid(req), req.params.id);
      const vehicles = await listFleetVehicles(req.params.id);
      res.json({ success: true, data: { vehicles } });
    } catch (e) { next(e); }
  }
  async createVehicle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const out = await addFleetVehicle(uid(req), req.params.id, req.body ?? {});
      res.status(201).json({ success: true, data: out });
    } catch (e) { next(e); }
  }
  async assignVehicle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { driver_id } = req.body ?? {};
      if (!driver_id) { res.status(422).json({ success: false, error: { message: 'driver_id required' } }); return; }
      await assignVehicleToDriver(uid(req), req.params.id, req.params.vid, driver_id);
      res.json({ success: true });
    } catch (e) { next(e); }
  }
  async unassignVehicle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await unassignVehicle(uid(req), req.params.id, req.params.vid);
      res.json({ success: true });
    } catch (e) { next(e); }
  }

  // ── Driver detail / history / split / remove ─────────────────────────────
  async driverDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await assertIsCompanyMember(uid(req), req.params.id);
      const detail = await getDriverDetail(req.params.id, req.params.driverId);
      res.json({ success: true, data: detail });
    } catch (e) { next(e); }
  }
  async driverRides(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Per-ride financials are admin-only.
      await assertAdmin(uid(req), req.params.id);
      const rides = await listDriverRides(req.params.id, req.params.driverId);
      res.json({ success: true, data: { rides } });
    } catch (e) { next(e); }
  }
  async setSplit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { driver_share, company_share } = req.body ?? {};
      const override = (driver_share != null && company_share != null)
        ? { driver_share: Number(driver_share), company_share: Number(company_share) }
        : null;
      await setDriverSplitOverride(uid(req), req.params.id, req.params.driverId, override);
      res.json({ success: true });
    } catch (e) { next(e); }
  }
  async removeDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await removeDriverFromFleet(uid(req), req.params.id, req.params.driverId);
      res.json({ success: true });
    } catch (e) { next(e); }
  }
}

export const companyController = new CompanyController();
