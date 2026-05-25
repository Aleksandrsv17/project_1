import { Router } from 'express';
import { rideController } from './ride.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// All ride routes require authentication
router.use(authenticate);

router.get('/active', rideController.active.bind(rideController));
router.get('/', rideController.history.bind(rideController));
router.post('/:id/rate', rideController.rate.bind(rideController));
router.post('/:id/rate-customer', rideController.rateCustomer.bind(rideController));

export default router;
