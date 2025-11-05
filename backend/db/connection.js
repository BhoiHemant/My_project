// db/connection.js - MySQL connection pool and auto table creation
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

let pool;

export const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true
    });
  }
  return pool;
};

export const initDB = async () => {
  const pool = getPool();

  // Ensure database exists (requires connection without DB). If fails, assume DB exists.
  try {
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
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
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'patient',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    await conn.query(createTablesSQL);
    // Ensure users.role exists even on older installations
    try {
      await conn.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'patient'");
    } catch (e) {
      // Fallback for MySQL versions without IF NOT EXISTS
      try {
        const [cols] = await conn.query("SHOW COLUMNS FROM users LIKE 'role'");
        if (!cols || cols.length === 0) {
          await conn.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'patient'");
        }
      } catch(_) { /* ignore */ }
    }
    console.log('Database tables are ensured.');
  } finally {
    conn.release();
  }
};
