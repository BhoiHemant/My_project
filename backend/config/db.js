import mysql from "mysql2/promise";
import dotenv from 'dotenv';

// Load environment variables early to avoid undefined values when this module is imported first
dotenv.config();

// Normalize env vars to support Railway (MYSQL*) and generic (DB_*)
const host = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST;
const user = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER;
const password = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD;
const database = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DB || process.env.MYSQL_DATABASE;
const port = Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306);

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 20000,
  // Enable SSL only in production (e.g., Render -> Railway). Local dev stays simple without SSL.
  ...(process.env.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: false } } : {})
});

export default pool;
