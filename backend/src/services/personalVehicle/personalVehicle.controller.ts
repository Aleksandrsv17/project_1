import { Request, Response, NextFunction } from 'express';
import {
  listForUser, createForUser, deleteForUser, setActiveForUser,
} from './personalVehicle.service';

function uid(req: Request): string {
  return (req as any).user?.sub;
}

class PersonalVehicleController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vehicles = await listForUser(uid(req));
      res.json({ success: true, data: { vehicles } });
    } catch (e) { next(e); }
  }
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vehicle = await createForUser(uid(req), req.body ?? {});
      res.status(201).json({ success: true, data: { vehicle } });
    } catch (e) { next(e); }
  }
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await deleteForUser(uid(req), req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  }
  async setActive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await setActiveForUser(uid(req), req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  }
}

export const personalVehicleController = new PersonalVehicleController();
