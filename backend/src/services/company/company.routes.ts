import { Router } from 'express';
import { companyController } from './company.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// ─ Self-service ────────────────────────────────────────────────────────────
router.post('/',          companyController.register.bind(companyController));   // register a new company
router.get('/me',         companyController.me.bind(companyController));         // company for this user
router.post('/invites/accept', companyController.acceptInvite.bind(companyController)); // driver accepts UID invite
router.post('/invites/redeem', companyController.redeemCode.bind(companyController));   // driver redeems code

// ─ Per-company (admin) ─────────────────────────────────────────────────────
router.post('/:id/invites',  companyController.createInvite.bind(companyController));
router.get('/:id/drivers',   companyController.drivers.bind(companyController));
router.get('/:id/earnings',  companyController.earnings.bind(companyController));

export default router;
