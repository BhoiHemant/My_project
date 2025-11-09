// routes/auth.js - Auth endpoints (signup, verify, login, resend-otp)
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { signup, verify, login, resendOtp, me, logout } from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';

const router = Router();

const emailValidator = body('email').isString().trim().isLength({ min: 3, max: 255 });
const passwordValidator = body('password').isString().isLength({ min: 8 });
const otpValidator = body('otp').isString().isLength({ min: 4, max: 10 });

const limiterTight = rateLimit({ windowMs: 5 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ message: 'Invalid input', errors: errors.array() });
  next();
};

router.post('/api/auth/signup', emailValidator, passwordValidator, validate, signup);
router.post('/api/auth/verify', limiterTight, emailValidator, otpValidator, validate, verify);
router.post('/api/auth/login', emailValidator, passwordValidator, validate, login);
router.post('/api/auth/resend-otp', limiterTight, emailValidator, validate, resendOtp);
router.get('/api/auth/me', auth, me);
router.post('/api/auth/logout', logout);

export default router;
