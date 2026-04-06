import { Router } from 'express';
import { userController } from './user.controller';
import { authenticate, requireRole } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

// Public auth routes (rate limited)
router.post('/register', authRateLimiter, userController.register.bind(userController));
router.post('/login', authRateLimiter, userController.login.bind(userController));
router.post('/refresh', authRateLimiter, userController.refresh.bind(userController));

// Protected routes
router.post('/logout', authenticate, userController.logout.bind(userController));
router.get('/profile', authenticate, userController.getProfile.bind(userController));
router.patch('/profile', authenticate, userController.updateProfile.bind(userController));
router.delete('/account', authenticate, userController.deleteAccount.bind(userController));

// Admin routes
router.get('/', authenticate, requireRole('admin'), userController.listAll.bind(userController));
router.patch('/:id/kyc', authenticate, requireRole('admin'), userController.updateKyc.bind(userController));

export default router;
