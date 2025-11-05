// routes/doctor.js - Protected CRUD endpoints for doctors
import { Router } from 'express';
import { auth, doctorOnly } from '../middleware/auth.js';
import { createDoctor, getDoctors, updateDoctor, deleteDoctor } from '../controllers/doctorController.js';

const router = Router();

router.post('/', auth, doctorOnly, createDoctor);
router.get('/', auth, doctorOnly, getDoctors);
router.put('/:id', auth, doctorOnly, updateDoctor);
router.delete('/:id', auth, doctorOnly, deleteDoctor);

export default router;
