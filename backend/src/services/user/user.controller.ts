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

  async listAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string ?? '1', 10) || 1;
      const limit = Math.min(parseInt(req.query.limit as string ?? '20', 10) || 20, 100);
      const { users, total } = await userService.listAll(page, limit);
      res.status(200).json({
        success: true,
        data: users,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateKyc(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { kyc_status } = req.body as { kyc_status: string };
      if (!kyc_status) throw new ValidationError('kyc_status is required');
      const user = await userService.updateKycStatus(req.params.id, kyc_status);
      res.status(200).json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  }

  async submitKyc(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { document_type, document_number, document_image_front, document_image_back, selfie_image } = req.body;

      if (!document_type || !document_image_front || !selfie_image) {
        throw new ValidationError('document_type, document_image_front, and selfie_image are required');
      }

      // Store KYC data and set status to submitted
      await userService.submitKyc(authReq.user.sub, {
        document_type,
        document_number: document_number ?? '',
        document_image_front,
        document_image_back,
        selfie_image,
      });

      res.status(200).json({
        success: true,
        data: { message: 'KYC documents submitted for review', status: 'submitted' },
      });
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as { email?: string };
      if (!email) throw new ValidationError('email is required');

      // Always return success to prevent email enumeration
      res.status(200).json({
        success: true,
        data: { message: 'If this email is registered, a password reset link has been sent.' },
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
