// controllers/billingController.js - Billing endpoints
import { getPool } from '../db/connection.js';

export const addBilling = async (req, res) => {
  const { doctor_id, patient_id, amount, date } = req.body;
  if (!doctor_id || !patient_id || amount == null || !date) {
    return res.status(400).json({ message: 'doctor_id, patient_id, amount, date are required' });
  }
  try {
    const pool = getPool();
    // Ensure referenced doctor exists in doctors table (auto-seed minimal record if missing)
    const [[doc]] = await pool.query('SELECT id FROM doctors WHERE id = ?', [doctor_id]);
    if (!doc) {
      await pool.query(
        'INSERT INTO doctors (id, name, specialization, contact) VALUES (?, ?, ?, ?)',
        [doctor_id, `Doctor #${doctor_id}`, 'General', 'N/A']
      );
    }

    // Ensure referenced patient exists in patients table (auto-seed minimal record if missing)
    const [[pat]] = await pool.query('SELECT id FROM patients WHERE id = ?', [patient_id]);
    if (!pat) {
      await pool.query(
        "INSERT INTO patients (id, name, age, gender, contact) VALUES (?, ?, ?, 'Other', ?)",
        [patient_id, `Patient #${patient_id}`, 0, 'N/A']
      );
    }

    const [result] = await pool.query(
      'INSERT INTO billing (doctor_id, patient_id, amount, date) VALUES (?, ?, ?, ?)',
      [doctor_id, patient_id, amount, date]
    );
    return res.status(201).json({ id: result.insertId, doctor_id, patient_id, amount, date });
  } catch (err) {
    console.error('Add billing error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getBillingByDoctor = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT b.*, d.name AS doctor_name, p.name AS patient_name
       FROM billing b
       LEFT JOIN doctors d ON d.id = b.doctor_id
       LEFT JOIN patients p ON p.id = b.patient_id
       WHERE b.doctor_id = ?
       ORDER BY b.date DESC, b.id DESC`,
      [id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Get billing by doctor error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getBillingSummary = async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT d.id AS doctor_id, d.name AS doctor_name, SUM(b.amount) AS total_amount, COUNT(b.id) AS bills_count
       FROM doctors d
       LEFT JOIN billing b ON b.doctor_id = d.id
       GROUP BY d.id, d.name
       ORDER BY (total_amount IS NULL) ASC, total_amount DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('Get billing summary error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
