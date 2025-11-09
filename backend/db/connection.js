// db/connection.js - MySQL connection pool and auto table creation
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import pool from '../config/db.js';
dotenv.config();

export const getPool = () => {
  return pool;
};

export const initDB = async () => {
  const pool = getPool();

  // Ensure database exists (requires connection without DB). If fails, assume DB exists.
  try {
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT || 3306),
      connectTimeout: 20000,
      ...(process.env.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: false } } : {})
    });
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await admin.end();
  } catch (e) {
    console.warn('Skipping CREATE DATABASE (insufficient privileges or already exists).');
  }

  // Create tables if not exists
  const createTablesSQL = `
    SET NAMES utf8mb4;

    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_verified TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS doctors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      specialization VARCHAR(100) NOT NULL,
      contact VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS patients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      age INT NOT NULL,
      gender ENUM('Male','Female','Other') NOT NULL,
      contact VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS billing (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id INT NOT NULL,
      patient_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_billing_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_billing_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB;
  `;

  const conn = await pool.getConnection();
  try {
    const statements = createTablesSQL
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    // Ensure legacy installs have necessary columns
    const ensureCol = async (name, def) => {
      const [cols] = await conn.query('SHOW COLUMNS FROM users LIKE ?', [name]);
      if (!cols || cols.length === 0) {
        await conn.query(`ALTER TABLE users ADD COLUMN ${def}`);
      }
    };
    await ensureCol('password_hash', 'password_hash VARCHAR(255) NOT NULL');
    await ensureCol('is_verified', 'is_verified TINYINT(1) DEFAULT 0');
    const [hasUpd] = await conn.query("SHOW COLUMNS FROM users LIKE 'updated_at'");
    if (!hasUpd || hasUpd.length === 0) {
      await conn.query('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    }

    // Optional: keep role/name if present in legacy schema
    // Ensure OTP table
    await conn.query(`CREATE TABLE IF NOT EXISTS email_otps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      otp VARCHAR(10) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    console.log('Database tables are ensured.');
  } finally {
    conn.release();
  }
};
