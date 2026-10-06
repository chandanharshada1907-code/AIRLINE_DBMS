const mysql = require("mysql2");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const dbHost = process.env.DB_HOST || "localhost";
const dbUser = process.env.DB_USER || "root";
const dbPassword = process.env.DB_PASSWORD || "";
const dbName = process.env.DB_NAME || "airline_db";
const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

console.log("🔌 Database Connection Config:");
console.log(`   Host: ${dbHost}`);
console.log(`   Port: ${dbPort}`);
console.log(`   Database: ${dbName}`);
console.log(`   User: ${dbUser}`);

// Create a MySQL Connection Pool
const pool = mysql.createPool({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    port: dbPort,
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
        console.error("👉 Please verify that MySQL Server is running and environment variables are correct.");
    } else {
        console.log(`✅ MySQL Connected Successfully to database: ${dbName} on ${dbHost}:${dbPort}`);
        connection.release();
    }
});

// Export promise-based pool for clean async/await queries
module.exports = pool.promise();