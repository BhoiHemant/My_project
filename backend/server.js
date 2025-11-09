// server.js - Entry point for Express server
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { initDB, getPool } from './db/connection.js';

// Routes
import authRoutes from './routes/auth.js';
import doctorRoutes from './routes/doctor.js';
import patientRoutes from './routes/patient.js';
import billingRoutes from './routes/billing.js';

dotenv.config();

const app = express();

// Health check with DB connectivity
app.get('/health', async (req, res) => {
  try {
    const pool = getPool();
    let db = { ok: false };
    try {
      const [rows] = await pool.query('SELECT 1 AS ok');
      db = { ok: rows && rows[0] && rows[0].ok === 1 };
    } catch (e) {
      db = { ok: false, error: 'db_unreachable' };
    }
    res.status(200).json({ status: 'ok', db });
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// Middleware
app.use(helmet());
app.use(cors({ origin: "https://vedamed.netlify.app", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Mount routes (no prefix to match requested endpoints)
app.use('/', authRoutes);
app.use('/doctors', doctorRoutes);
app.use('/patients', patientRoutes);
app.use('/billing', billingRoutes);

// Start server and initialize DB (do not exit on DB failure)
const PORT = process.env.PORT || 5000;

(async () => {
  let dbReady = false;
  try {
    await initDB();
    dbReady = true;
  } catch (err) {
    console.error('Failed to initialize DB', err);
  }
  app.listen(PORT, async () => {
    console.log(`✅ Server running on port ${PORT}`);
    if (!dbReady) {
      console.warn('[WARN] DB not initialized at startup; API endpoints involving DB may fail until resolved.');
    } else {
      console.log('✅ Database connected successfully');
    }
    // Proactive DB ping for clearer logs
    try {
      const pool = getPool();
      await pool.query('SELECT 1');
      console.log('✅ DB ping successful');
    } catch (e) {
      console.error('❌ DB ping failed at startup');
    }
  });
})();
