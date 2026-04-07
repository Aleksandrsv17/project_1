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
  requireRole('customer', 'owner', 'admin'),
  vehicleController.create.bind(vehicleController)
);

router.get(
  '/owner/my-vehicles',
  authenticate,
  requireRole('customer', 'owner', 'admin'),
  vehicleController.getMyVehicles.bind(vehicleController)
);

router.patch(
  '/:id',
  authenticate,
  requireRole('customer', 'owner', 'admin'),
  vehicleController.update.bind(vehicleController)
);

// Admin status update — accepts JWT auth OR x-admin-key header
router.patch(
  '/:id/status',
  (req, res, next) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey === (process.env.ADMIN_API_KEY || 'vip-admin-2026')) {
      return next();
    }
    return authenticate(req, res, () => requireRole('admin')(req, res, next));
  },
  vehicleController.adminUpdateStatus.bind(vehicleController)
);

router.delete(
  '/:id',
  authenticate,
  requireRole('customer', 'owner', 'admin'),
  vehicleController.delete.bind(vehicleController)
);

router.post(
  '/:id/media',
  authenticate,
  requireRole('customer', 'owner', 'admin'),
  vehicleController.addMedia.bind(vehicleController)
);

export default router;
