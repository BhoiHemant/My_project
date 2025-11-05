// routes/billing.js - Protected billing endpoints
import { Router } from 'express';
import { auth, doctorOnly } from '../middleware/auth.js';
import { addBilling, getBillingByDoctor, getBillingSummary } from '../controllers/billingController.js';

const router = Router();

router.post('/add', auth, doctorOnly, addBilling);
router.get('/doctor/:id', auth, doctorOnly, getBillingByDoctor);
router.get('/summary', auth, doctorOnly, getBillingSummary);

export default router;
