const mysql = require("mysql2");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Create a MySQL Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "airline_db",
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }
});

// Test connection on startup
pool.getConnection((err, connection) => {
    if (err) {
        console.error("❌ MySQL Connection Failed!");
        console.error("Error Code:", err.code);
        console.error("Error Message:", err.message);
        console.error("👉 Please verify that MySQL Server is running and .env credentials are correct.");
    } else {
        console.log("✅ MySQL Connected Successfully to database:", process.env.DB_NAME || "airline_db");
        connection.release();
    }
});

// Export promise-based pool for clean async/await queries
module.exports = pool.promise();