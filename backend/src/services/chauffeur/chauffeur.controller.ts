import { Request, Response, NextFunction } from 'express';
import { chauffeurService } from './chauffeur.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  createChauffeurSchema,
  updateChauffeurLocationSchema,
  validate,
} from '../../utils/validators';
import { ValidationError } from '../../middleware/errorHandler';

export class ChauffeurController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(createChauffeurSchema, req.body);
      if (error) throw new ValidationError(error);

      const chauffeur = await chauffeurService.register(authReq.user.sub, value);
      res.status(201).json({ success: true, data: { chauffeur } });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const chauffeur = await chauffeurService.getById(req.params.id);
      res.status(200).json({ success: true, data: { chauffeur } });
    } catch (err) {
      next(err);
    }
  }

  async getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const chauffeur = await chauffeurService.getMyProfile(authReq.user.sub);
      res.status(200).json({ success: true, data: { chauffeur } });
    } catch (err) {
      next(err);
    }
  }

  async listAvailable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const chauffeurs = await chauffeurService.listAvailable();
      res.status(200).json({ success: true, data: { chauffeurs } });
    } catch (err) {
      next(err);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const chauffeur = await chauffeurService.approve(req.params.id);
      res.status(200).json({ success: true, data: { chauffeur } });
    } catch (err) {
      next(err);
    }
  }

  async toggleAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { is_available } = req.body as { is_available: boolean };

      if (typeof is_available !== 'boolean') {
        throw new ValidationError('is_available must be a boolean');
      }

      const chauffeur = await chauffeurService.updateAvailability(authReq.user.sub, is_available);
      res.status(200).json({ success: true, data: { chauffeur } });
    } catch (err) {
      next(err);
    }
  }

  async updateLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(updateChauffeurLocationSchema, req.body);
      if (error) throw new ValidationError(error);

      await chauffeurService.updateLocation(authReq.user.sub, value.lat, value.lng);
      res.status(200).json({ success: true, data: { message: 'Location updated' } });
    } catch (err) {
      next(err);
    }
  }
  async getBookingLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const location = await chauffeurService.getLocationByBooking(req.params.bookingId);
      res.status(200).json({ success: true, data: location });
    } catch (err) {
      next(err);
    }
  }
}

export const chauffeurController = new ChauffeurController();
