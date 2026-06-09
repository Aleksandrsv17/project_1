import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { personalVehicleController } from './personalVehicle.controller';

const router = Router();
router.use(authenticate);

// All routes scoped to the authenticated user — no admin / cross-user access.
router.get('/',             personalVehicleController.list.bind(personalVehicleController));
router.post('/',            personalVehicleController.create.bind(personalVehicleController));
router.delete('/:id',       personalVehicleController.remove.bind(personalVehicleController));
router.post('/:id/active',  personalVehicleController.setActive.bind(personalVehicleController));

export default router;
