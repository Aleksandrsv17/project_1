import { Request, Response, NextFunction } from 'express';
import { vehicleService } from './vehicle.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleQuerySchema,
  validate,
} from '../../utils/validators';
import { ValidationError } from '../../middleware/errorHandler';

export class VehicleController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(createVehicleSchema, req.body);
      if (error) throw new ValidationError(error);

      const vehicle = await vehicleService.create(authReq.user.sub, value);

      res.status(201).json({ success: true, data: { vehicle } });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { value, error } = validate(vehicleQuerySchema, req.query);
      if (error) throw new ValidationError(error);

      const { vehicles, total } = await vehicleService.findAll(value);
      const page = value.page;
      const limit = value.limit;

      res.status(200).json({
        success: true,
        data: {
          vehicles,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vehicle = await vehicleService.findById(req.params.id);
      res.status(200).json({ success: true, data: { vehicle } });
    } catch (err) {
      next(err);
    }
  }

  async getMyVehicles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const vehicles = await vehicleService.findByOwner(authReq.user.sub);
      res.status(200).json({ success: true, data: { vehicles } });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(updateVehicleSchema, req.body);
      if (error) throw new ValidationError(error);

      const vehicle = await vehicleService.update(req.params.id, authReq.user.sub, value);
      res.status(200).json({ success: true, data: { vehicle } });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      await vehicleService.delete(req.params.id, authReq.user.sub);
      res.status(200).json({ success: true, data: { message: 'Vehicle deactivated' } });
    } catch (err) {
      next(err);
    }
  }

  async addMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { url, is_primary } = req.body as { url: string; is_primary?: boolean };

      if (!url || typeof url !== 'string' || !/^https:\/\/.+/i.test(url)) {
        throw new ValidationError('url must be a valid HTTPS URL');
      }

      await vehicleService.addMedia(req.params.id, authReq.user.sub, url, is_primary ?? false);
      res.status(201).json({ success: true, data: { message: 'Media added' } });
    } catch (err) {
      next(err);
    }
  }
}

export const vehicleController = new VehicleController();
