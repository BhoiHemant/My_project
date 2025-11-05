// server.js - Entry point for Express server
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
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
app.use(cors()); // Enable CORS for all origins; adjust as needed
app.use(express.json()); // Parse JSON bodies
app.use(morgan('dev')); // HTTP request logging

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
    }
    // Self-test runner
    try{
        if (globalThis.__ran_self_tests__) return; // run once
        globalThis.__ran_self_tests__ = true;
        if (typeof fetch !== 'function') { console.warn('[SELFTEST] fetch not available in Node runtime'); return; }
        const base = `http://localhost:${PORT}`;
        const results = { ok: [], fail: [] };
        const ok = (m)=>{ console.log(`✅ ${m} passed`); results.ok.push(m); };
        const fail = (m,e)=>{ console.error(`❌ ${m} failed — ${e?.message||e}`); results.fail.push(`${m}: ${e?.message||e}`); };

        const post = async (url, body, token)=>{
          const res = await fetch(base+url, { method:'POST', headers: { 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) }, body: JSON.stringify(body||{}) });
          const text = await res.text();
          let data; try{ data = JSON.parse(text); }catch{ data = text; }
          if(!res.ok){ const err = new Error((data&&data.message)||`HTTP ${res.status}`); err.status=res.status; err.data=data; throw err; }
          return data;
        };
        const get = async (url, token)=>{
          const res = await fetch(base+url, { headers: { ...(token?{Authorization:`Bearer ${token}`}:{}) } });
          const text = await res.text(); let data; try{ data=JSON.parse(text);}catch{ data=text; }
          if(!res.ok){ const err = new Error((data&&data.message)||`HTTP ${res.status}`); err.status=res.status; err.data=data; throw err; }
          return { res, data };
        };

        // Signup patient
        const stamp = Date.now();
        const patientEmail = `pt_${stamp}@example.com`;
        const doctorEmail = `dr_${stamp}@example.com`;
        const password = 'test1234';
        try{ await post('/signup', { name:'Patient T', email: patientEmail, password, role:'patient' }); ok('POST /signup (patient)'); } catch(e){ fail('POST /signup (patient)', e); }
        try{ await post('/signup', { name:'Doctor T', email: doctorEmail, password, role:'doctor' }); ok('POST /signup (doctor)'); } catch(e){ fail('POST /signup (doctor)', e); }

        // Login
        let ptToken, drToken, drId;
        try{ const d = await post('/login', { email: patientEmail, password }); if(!d?.token||!d?.user?.role) throw new Error('Missing token/role'); ptToken=d.token; ok('POST /login (patient token with role)'); } catch(e){ fail('POST /login (patient)', e); }
        try{ const d = await post('/login', { email: doctorEmail, password }); if(!d?.token||d?.user?.role!=='doctor') throw new Error('Missing token/doctor role'); drToken=d.token; drId = d.user?.id; ok('POST /login (doctor token with role)'); } catch(e){ fail('POST /login (doctor)', e); }

        // Health
        try{ const r = await get('/health'); if(r.data?.status==='ok') ok('GET /health'); else throw new Error('Invalid payload'); } catch(e){ fail('GET /health', e); }

        // Doctor-only endpoints with doctor token
        if(drToken && drId){
          try{ await get(`/billing/doctor/${drId}`, drToken); ok('GET /billing/doctor/:id (doctor)'); } catch(e){ fail('GET /billing/doctor/:id (doctor)', e); }
          try{ const today = new Date().toISOString().slice(0,10); const d = await post('/billing/add', { doctor_id: drId, patient_id: 1, amount: 1, date: today }, drToken); if(!d?.id) throw new Error('No id'); ok('POST /billing/add (doctor)'); } catch(e){ fail('POST /billing/add (doctor)', e); }
        }

        // Doctor-only with patient token should 403
        if(ptToken && drId){
          try{ await get(`/billing/doctor/${drId}`, ptToken); fail('GET /billing/doctor/:id (patient)', new Error('Expected 403')); } catch(e){ if(e?.status===403) ok('GET /billing/doctor/:id (patient forbidden)'); else fail('GET /billing/doctor/:id (patient)', e); }
        }

        // Summary
        console.log('[SELFTEST SUMMARY] ok=', results.ok.length, 'fail=', results.fail.length);
      }catch(e){ console.error('[SELFTEST] runner error:', e); }
  });
})();
