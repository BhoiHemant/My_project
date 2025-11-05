// controllers/doctorController.js - CRUD for doctors
import { getPool } from '../db/connection.js';

export const createDoctor = async (req, res) => {
  const { name, specialization, contact } = req.body;
  if (!name || !specialization || !contact) {
    return res.status(400).json({ message: 'name, specialization, contact are required' });
  }
  try {
    const pool = getPool();
    const [result] = await pool.query(
      'INSERT INTO doctors (name, specialization, contact) VALUES (?, ?, ?)',
      [name, specialization, contact]
    );
    return res.status(201).json({ id: result.insertId, name, specialization, contact });
  } catch (err) {
    console.error('Create doctor error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getDoctors = async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM doctors ORDER BY id DESC');
    return res.json(rows);
  } catch (err) {
    console.error('Get doctors error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateDoctor = async (req, res) => {
  const { id } = req.params;
  const { name, specialization, contact } = req.body;
  try {
    const pool = getPool();
    const [result] = await pool.query(
      'UPDATE doctors SET name = ?, specialization = ?, contact = ? WHERE id = ?',
      [name, specialization, contact, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Doctor not found' });
    return res.json({ id: Number(id), name, specialization, contact });
  } catch (err) {
    console.error('Update doctor error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteDoctor = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM doctors WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Doctor not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete doctor error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
