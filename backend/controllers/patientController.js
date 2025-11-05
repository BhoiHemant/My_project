// controllers/patientController.js - CRUD for patients
import { getPool } from '../db/connection.js';

export const createPatient = async (req, res) => {
  const { name, age, gender, contact } = req.body;
  if (!name || age == null || !gender || !contact) {
    return res.status(400).json({ message: 'name, age, gender, contact are required' });
  }
  try {
    const pool = getPool();
    const [result] = await pool.query(
      'INSERT INTO patients (name, age, gender, contact) VALUES (?, ?, ?, ?)',
      [name, age, gender, contact]
    );
    return res.status(201).json({ id: result.insertId, name, age, gender, contact });
  } catch (err) {
    console.error('Create patient error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getPatients = async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM patients ORDER BY id DESC');
    return res.json(rows);
  } catch (err) {
    console.error('Get patients error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updatePatient = async (req, res) => {
  const { id } = req.params;
  const { name, age, gender, contact } = req.body;
  try {
    const pool = getPool();
    const [result] = await pool.query(
      'UPDATE patients SET name = ?, age = ?, gender = ?, contact = ? WHERE id = ?',
      [name, age, gender, contact, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Patient not found' });
    return res.json({ id: Number(id), name, age, gender, contact });
  } catch (err) {
    console.error('Update patient error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deletePatient = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM patients WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Patient not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete patient error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
