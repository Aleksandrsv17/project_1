import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtAccessPayload } from '../utils/jwt';
import { AppError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  user: JwtAccessPayload;
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Missing or invalid authorization header', 401));
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === 'TokenExpiredError'
        ? 'Access token expired'
        : 'Invalid access token';
    next(new AppError(message, 401));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      return next(new AppError('Not authenticated', 401));
    }

    if (!roles.includes(authReq.user.role)) {
      return next(
        new AppError(
          `Forbidden: requires one of [${roles.join(', ')}] role`,
          403
        )
      );
    }

    next();
  };
}
