import { Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateUserSchema,
  validate,
} from '../../utils/validators';
import { ValidationError } from '../../middleware/errorHandler';

export class UserController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { value, error } = validate(registerSchema, req.body);
      if (error) throw new ValidationError(error);

      const result = await userService.register(value);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { value, error } = validate(loginSchema, req.body);
      if (error) throw new ValidationError(error);

      const result = await userService.login(value);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { value, error } = validate(refreshTokenSchema, req.body);
      if (error) throw new ValidationError(error);

      const tokens = await userService.refresh(value.refresh_token);

      res.status(200).json({
        success: true,
        data: tokens,
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const refreshToken = req.body?.refresh_token as string | undefined;

      await userService.logout(authReq.user.sub, refreshToken);

      res.status(200).json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (err) {
      next(err);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = await userService.getById(authReq.user.sub);

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { value, error } = validate(updateUserSchema, req.body);
      if (error) throw new ValidationError(error);

      const user = await userService.update(authReq.user.sub, value);

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      await userService.delete(authReq.user.sub);

      res.status(200).json({
        success: true,
        data: { message: 'Account deleted successfully' },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
