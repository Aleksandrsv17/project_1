import { Router } from 'express';
import { chauffeurController } from './chauffeur.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Public routes
router.get('/available', chauffeurController.listAvailable.bind(chauffeurController));
router.get('/:id', chauffeurController.getById.bind(chauffeurController));

router.get(
  '/booking/:bookingId/location',
  authenticate,
  chauffeurController.getBookingLocation.bind(chauffeurController)
);

// Authenticated routes
router.post(
  '/register',
  authenticate,
  chauffeurController.register.bind(chauffeurController)
);

router.patch(
  '/:id/approve',
  authenticate,
  requireRole('admin'),
  chauffeurController.approve.bind(chauffeurController)
);

router.get(
  '/me/profile',
  authenticate,
  requireRole('chauffeur', 'admin'),
  chauffeurController.getMyProfile.bind(chauffeurController)
);

router.patch(
  '/me/availability',
  authenticate,
  requireRole('chauffeur', 'admin'),
  chauffeurController.toggleAvailability.bind(chauffeurController)
);

router.patch(
  '/me/location',
  authenticate,
  requireRole('chauffeur', 'admin'),
  chauffeurController.updateLocation.bind(chauffeurController)
);

export default router;
