// controllers/authController.js - Secure email/password auth with OTP verification
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool } from '../db/connection.js';
import { sendOtpMail } from '../utils/mailer.js';

const SALT_ROUNDS = 12;

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function passwordStrong(pw) {
  return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(pw || '');
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAgeMs = parseExpiryToMs(process.env.JWT_EXPIRES_IN || '15m');
  return {
    httpOnly: true,
    sameSite: 'Strict',
    secure: isProd,
    path: '/',
    maxAge: maxAgeMs
  };
}

function parseExpiryToMs(exp) {
  // supports 15m, 1h, 7d
  const m = /^([0-9]+)\s*([smhd])$/.exec(String(exp).trim());
  if (!m) return 15 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  const map = { s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 24 * 3600 * 1000 };
  return n * map[unit];
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const signup = async (req, res) => {
  const { email, password } = req.body || {};
  const normEmail = normalizeEmail(email);
  if (!normEmail) return res.status(400).json({ message: 'Email is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) return res.status(400).json({ message: 'Invalid email' });
  if (!passwordStrong(password)) return res.status(400).json({ message: 'Weak password' });

  try {
    const pool = getPool();
    const [existing] = await pool.query('SELECT id, is_verified FROM users WHERE email = ?', [normEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [resUser] = await pool.query(
      'INSERT INTO users (email, password_hash, is_verified) VALUES (?, ?, 0)',
      [normEmail, password_hash]
    );
    const userId = resUser.insertId;

    const otp = generateOtp();
    const [otpInsert] = await pool.query(
      'INSERT INTO email_otps (user_id, otp, expires_at, attempts) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), 0)',
      [userId, otp]
    );
    await sendOtpMail(normEmail, otp);
    return res.status(200).json({ message: 'OTP sent' });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const verify = async (req, res) => {
  const { email, otp } = req.body || {};
  const normEmail = normalizeEmail(email);
  if (!normEmail || !otp) return res.status(400).json({ message: 'email and otp are required' });
  try {
    const pool = getPool();
    const [users] = await pool.query('SELECT id, is_verified FROM users WHERE email = ?', [normEmail]);
    if (users.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = users[0];
    if (user.is_verified) return res.status(200).json({ message: 'Already verified' });

    const [rows] = await pool.query(
      'SELECT id, otp, expires_at, attempts FROM email_otps WHERE user_id = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [user.id]
    );
    if (rows.length === 0) return res.status(400).json({ message: 'OTP expired or not found' });
    const rec = rows[0];
    if (Number(rec.attempts) >= 5) return res.status(429).json({ message: 'Too many attempts, try later' });
    if (String(rec.otp) !== String(otp)) {
      await pool.query('UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?', [rec.id]);
      return res.status(400).json({ message: 'Incorrect OTP' });
    }

    await pool.query('UPDATE users SET is_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    await pool.query('DELETE FROM email_otps WHERE user_id = ?', [user.id]);
    return res.status(200).json({ message: 'Email verified' });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body || {};
  const normEmail = normalizeEmail(email);
  if (!normEmail || !password) return res.status(400).json({ message: 'email and password are required' });
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, email, password_hash, is_verified FROM users WHERE email = ?',
      [normEmail]
    );
    if (rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = rows[0];
    if (!user.is_verified) return res.status(403).json({ message: 'Email not verified' });
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m'
    });
    res.cookie('access_token', token, cookieOptions());
    return res.status(200).json({ success: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const resendOtp = async (req, res) => {
  const { email } = req.body || {};
  const normEmail = normalizeEmail(email);
  if (!normEmail) return res.status(400).json({ message: 'email is required' });
  try {
    const pool = getPool();
    const [users] = await pool.query('SELECT id, is_verified FROM users WHERE email = ?', [normEmail]);
    if (users.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = users[0];
    if (user.is_verified) return res.status(200).json({ message: 'Already verified' });
    const otp = generateOtp();
    await pool.query(
      'INSERT INTO email_otps (user_id, otp, expires_at, attempts) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), 0)',
      [user.id, otp]
    );
    await sendOtpMail(normEmail, otp);
    return res.status(200).json({ message: 'OTP resent' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

