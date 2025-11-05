// routes/patient.js - Protected CRUD endpoints for patients
import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { createPatient, getPatients, updatePatient, deletePatient } from '../controllers/patientController.js';

const router = Router();

router.post('/', auth, createPatient);
router.get('/', auth, getPatients);
router.put('/:id', auth, updatePatient);
router.delete('/:id', auth, deletePatient);

export default router;
