import { Router } from 'express';
import { vehicleController } from './vehicle.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

// Public routes
router.get('/', vehicleController.list.bind(vehicleController));
router.get('/:id', vehicleController.getById.bind(vehicleController));

// Owner-only routes
router.post(
  '/',
  authenticate,
  requireRole('owner', 'admin'),
  vehicleController.create.bind(vehicleController)
);

router.get(
  '/owner/my-vehicles',
  authenticate,
  requireRole('owner', 'admin'),
  vehicleController.getMyVehicles.bind(vehicleController)
);

router.patch(
  '/:id',
  authenticate,
  requireRole('owner', 'admin'),
  vehicleController.update.bind(vehicleController)
);

router.delete(
  '/:id',
  authenticate,
  requireRole('owner', 'admin'),
  vehicleController.delete.bind(vehicleController)
);

router.post(
  '/:id/media',
  authenticate,
  requireRole('owner', 'admin'),
  vehicleController.addMedia.bind(vehicleController)
);

export default router;
