// server.js - Entry point for Express server
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { initDB } from './db/connection.js';

// Routes
import authRoutes from './routes/auth.js';
import doctorRoutes from './routes/doctor.js';
import patientRoutes from './routes/patient.js';
import billingRoutes from './routes/billing.js';

dotenv.config();

const app = express();

// Health check
app.get('/health', (req, res) => {
  try {
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// Middleware
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN, credentials: true }));
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
  });
})();
