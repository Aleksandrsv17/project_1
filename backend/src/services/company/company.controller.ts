import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  registerCompany, getCompanyForUser, createInvite,
  acceptUidInvite, redeemInviteByCode, listDrivers, companyEarnings,
} from './company.service';

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
      const company = await getCompanyForUser(uid(req));
      res.json({ success: true, data: { company } });
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
      // Light auth: must be a member of the company. Stricter admin gate is
      // baked into mutation endpoints (assertIsCompanyAdmin).
      const drivers = await listDrivers(req.params.id);
      res.json({ success: true, data: { drivers } });
    } catch (e) { next(e); }
  }

  async earnings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const from = req.query.from ? String(req.query.from) : undefined;
      const to = req.query.to ? String(req.query.to) : undefined;
      const summary = await companyEarnings(req.params.id, from, to);
      res.json({ success: true, data: summary });
    } catch (e) { next(e); }
  }
}

export const companyController = new CompanyController();
