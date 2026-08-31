const mysql = require("mysql2/promise");

const useTiDB =
  process.env.TIDB_ENABLE_SSL === "true" || Boolean(process.env.TIDB_HOST);

const database = mysql.createPool({
  host: process.env.TIDB_HOST || process.env.DB_HOST,
  port: Number(process.env.TIDB_PORT || process.env.DB_PORT || 3306),
  database: process.env.TIDB_DATABASE || process.env.DB_NAME,
  user: process.env.TIDB_USER || process.env.DB_USER,
  password: process.env.TIDB_PASSWORD || process.env.DB_PASSWORD,
  ssl: useTiDB
    ? {
        minVersion: "TLSv1.2",
      }
    : undefined,
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
});

module.exports = database;
