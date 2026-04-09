import { Router } from 'express';
import { bookingController } from './booking.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// All booking routes require authentication
router.use(authenticate);

// Static routes FIRST
router.post('/', bookingController.create.bind(bookingController));
router.get('/my', bookingController.myBookings.bind(bookingController));
router.get('/owner-vehicles', bookingController.ownerBookings.bind(bookingController));
router.get('/earnings-summary', bookingController.earningsSummary.bind(bookingController));
router.post('/confirm-payment', bookingController.confirm.bind(bookingController));

// Parametrized routes
router.patch('/:id/start', bookingController.startRide.bind(bookingController));
router.patch('/:id/complete', bookingController.complete.bind(bookingController));
router.patch('/:id/cancel', bookingController.cancel.bind(bookingController));
router.post('/:id/rate', bookingController.rate.bind(bookingController));

// Dynamic /:id MUST be LAST
router.get('/:id', bookingController.getById.bind(bookingController));

export default router;
