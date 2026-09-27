const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5050;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// ==========================================================
// 1. ADVANCED DATABASE SCHEMA INITIALIZATION (SAFE & NON-DESTRUCTIVE)
// ==========================================================
async function initAdvancedSchema() {
    try {
        console.log("🛠️  Checking & initializing advanced DBMS schema...");

        // 1. Non-destructively enhance users table
        const [userCols] = await db.query("DESCRIBE users");
        const userColNames = userCols.map(c => c.Field);
        if (!userColNames.includes("role")) {
            await db.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'USER'");
        }
        if (!userColNames.includes("phone")) {
            await db.query("ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT ''");
        }
        if (!userColNames.includes("is_active")) {
            await db.query("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE");
        }
        if (!userColNames.includes("created_at")) {
            await db.query("ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
        }

        // 2. Non-destructively enhance flights table
        const [flightCols] = await db.query("DESCRIBE flights");
        const flightColNames = flightCols.map(c => c.Field);
        if (!flightColNames.includes("status")) {
            await db.query("ALTER TABLE flights ADD COLUMN status VARCHAR(20) DEFAULT 'SCHEDULED'");
        }

        // 3. Create seats table
        await db.query(`
            CREATE TABLE IF NOT EXISTS seats (
                seat_id INT AUTO_INCREMENT PRIMARY KEY,
                flight_id INT NOT NULL,
                seat_number VARCHAR(10) NOT NULL,
                seat_class VARCHAR(20) DEFAULT 'Economy',
                status ENUM('AVAILABLE', 'BOOKED') DEFAULT 'AVAILABLE',
                FOREIGN KEY (flight_id) REFERENCES flights(flight_id) ON DELETE CASCADE,
                UNIQUE KEY unique_flight_seat (flight_id, seat_number)
            )
        `);

        // 4. Create payments table
        await db.query(`
            CREATE TABLE IF NOT EXISTS payments (
                payment_id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT NOT NULL,
                transaction_id VARCHAR(50) UNIQUE NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                payment_method VARCHAR(30) NOT NULL,
                payment_status ENUM('SUCCESS', 'FAILED', 'PENDING') DEFAULT 'SUCCESS',
                payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
            )
        `);

        // 5. Create refunds table
        await db.query(`
            CREATE TABLE IF NOT EXISTS refunds (
                refund_id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT NOT NULL,
                transaction_id VARCHAR(50) NOT NULL,
                refund_amount DECIMAL(10, 2) NOT NULL,
                refund_status ENUM('PROCESSED', 'PENDING') DEFAULT 'PROCESSED',
                refund_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 6. Create waitlist table
        await db.query(`
            CREATE TABLE IF NOT EXISTS waitlist (
                waitlist_id INT AUTO_INCREMENT PRIMARY KEY,
                flight_id INT NOT NULL,
                user_id INT NOT NULL,
                passenger_name VARCHAR(100) NOT NULL,
                passenger_email VARCHAR(100),
                passenger_phone VARCHAR(20),
                position INT DEFAULT 1,
                status ENUM('WAITING', 'CONFIRMED', 'CANCELLED') DEFAULT 'WAITING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (flight_id) REFERENCES flights(flight_id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // 7. Create notifications table
        await db.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                notification_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                booking_id INT NULL,
                message TEXT NOT NULL,
                notification_type VARCHAR(50) DEFAULT 'GENERAL',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // 8. Create airports table
        await db.query(`
            CREATE TABLE IF NOT EXISTS airports (
                airport_id INT AUTO_INCREMENT PRIMARY KEY,
                airport_code VARCHAR(10) UNIQUE NOT NULL,
                airport_name VARCHAR(150) NOT NULL,
                city VARCHAR(100) NOT NULL,
                state VARCHAR(100),
                country VARCHAR(100) DEFAULT 'India'
            )
        `);

        // Seed default Indian airports if empty
        const [airportCount] = await db.query("SELECT COUNT(*) AS count FROM airports");
        if (airportCount[0].count === 0) {
            await db.query(`
                INSERT INTO airports (airport_code, airport_name, city, state, country) VALUES
                ('PNQ', 'Pune International Airport', 'Pune', 'Maharashtra', 'India'),
                ('DEL', 'Indira Gandhi International Airport', 'Delhi', 'Delhi', 'India'),
                ('BOM', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai', 'Maharashtra', 'India'),
                ('BLR', 'Kempegowda International Airport', 'Bangalore', 'Karnataka', 'India'),
                ('HYD', 'Rajiv Gandhi International Airport', 'Hyderabad', 'Telangana', 'India'),
                ('MAA', 'Chennai International Airport', 'Chennai', 'Tamil Nadu', 'India'),
                ('GOI', 'Dabolim Airport', 'Goa', 'Goa', 'India')
            `);
        }

        // 9. Create aircraft table
        await db.query(`
            CREATE TABLE IF NOT EXISTS aircraft (
                aircraft_id INT AUTO_INCREMENT PRIMARY KEY,
                aircraft_number VARCHAR(20) UNIQUE NOT NULL,
                aircraft_type VARCHAR(50) NOT NULL,
                total_seats INT DEFAULT 180,
                airline VARCHAR(50) NOT NULL
            )
        `);

        // Seed aircraft if empty
        const [aircraftCount] = await db.query("SELECT COUNT(*) AS count FROM aircraft");
        if (aircraftCount[0].count === 0) {
            await db.query(`
                INSERT INTO aircraft (aircraft_number, aircraft_type, total_seats, airline) VALUES
                ('VT-INA', 'Airbus A320neo', 180, 'IndiGo'),
                ('VT-EXA', 'Boeing 737-800', 186, 'Air India'),
                ('VT-VTA', 'Airbus A321neo', 192, 'Vistara'),
                ('VT-SGA', 'Boeing 737 MAX 8', 189, 'SpiceJet'),
                ('VT-QPA', 'Boeing 737 MAX', 189, 'Akasa Air')
            `);
        }

        // 10. Ensure Admin account exists in MySQL
        const [adminRows] = await db.query("SELECT user_id FROM users WHERE email = 'admin@skywings.com'");
        if (adminRows.length === 0) {
            await db.query("INSERT INTO users (name, email, password, role) VALUES ('SkyWings Administrator', 'admin@skywings.com', 'admin123', 'ADMIN')");
        } else {
            await db.query("UPDATE users SET role = 'ADMIN' WHERE email = 'admin@skywings.com'");
        }

        // 11. Create SQL View
        try {
            await db.query(`
                CREATE OR REPLACE VIEW view_available_flights AS
                SELECT 
                    f.flight_id,
                    f.flight_number,
                    f.source,
                    f.destination,
                    f.departure_time,
                    f.arrival_time,
                    f.price,
                    f.total_seats,
                    COALESCE(f.status, 'SCHEDULED') AS flight_status,
                    (f.total_seats - (SELECT COUNT(*) FROM bookings b WHERE b.flight_id = f.flight_id)) AS available_seats
                FROM flights f
            `);
        } catch (vErr) {
            console.warn("View creation warning:", vErr.message);
        }

        console.log("✅ Advanced DBMS schema initialized successfully!");
    } catch (err) {
        console.error("Schema initialization error:", err);
    }
}

// ==========================================================
// 2. SEED REALISTIC FLIGHT DATA IF FEWER THAN 15 FLIGHTS EXIST
// ==========================================================
const sampleFlights = [
    { flight_number: "AI101", source: "Pune", destination: "Delhi", departure_time: "2026-10-01 06:00:00", arrival_time: "2026-10-01 08:15:00", price: 5500.00, total_seats: 180 },
    { flight_number: "6E201", source: "Pune", destination: "Delhi", departure_time: "2026-10-01 11:30:00", arrival_time: "2026-10-01 13:45:00", price: 4800.00, total_seats: 180 },
    { flight_number: "UK501", source: "Pune", destination: "Delhi", departure_time: "2026-10-01 18:00:00", arrival_time: "2026-10-01 20:15:00", price: 6200.00, total_seats: 160 },
    { flight_number: "6E305", source: "Pune", destination: "Mumbai", departure_time: "2026-10-01 07:15:00", arrival_time: "2026-10-01 08:10:00", price: 2800.00, total_seats: 150 },
    { flight_number: "AI205", source: "Pune", destination: "Mumbai", departure_time: "2026-10-01 16:45:00", arrival_time: "2026-10-01 17:40:00", price: 3100.00, total_seats: 180 },
    { flight_number: "6E412", source: "Pune", destination: "Bangalore", departure_time: "2026-10-01 08:30:00", arrival_time: "2026-10-01 10:05:00", price: 4200.00, total_seats: 180 },
    { flight_number: "SG401", source: "Pune", destination: "Bangalore", departure_time: "2026-10-01 15:20:00", arrival_time: "2026-10-01 16:55:00", price: 3900.00, total_seats: 180 },
    { flight_number: "AI102", source: "Pune", destination: "Hyderabad", departure_time: "2026-10-01 09:00:00", arrival_time: "2026-10-01 10:15:00", price: 3600.00, total_seats: 180 },
    { flight_number: "6E521", source: "Pune", destination: "Hyderabad", departure_time: "2026-10-01 19:40:00", arrival_time: "2026-10-01 20:55:00", price: 3400.00, total_seats: 180 },
    { flight_number: "UK510", source: "Pune", destination: "Chennai", departure_time: "2026-10-01 07:45:00", arrival_time: "2026-10-01 09:35:00", price: 4900.00, total_seats: 160 },
    { flight_number: "AI302", source: "Mumbai", destination: "Delhi", departure_time: "2026-10-01 06:30:00", arrival_time: "2026-10-01 08:45:00", price: 5100.00, total_seats: 200 },
    { flight_number: "6E601", source: "Mumbai", destination: "Delhi", departure_time: "2026-10-01 14:15:00", arrival_time: "2026-10-01 16:30:00", price: 4600.00, total_seats: 180 },
    { flight_number: "UK815", source: "Mumbai", destination: "Delhi", departure_time: "2026-10-01 20:00:00", arrival_time: "2026-10-01 22:15:00", price: 5800.00, total_seats: 160 },
    { flight_number: "6E702", source: "Mumbai", destination: "Bangalore", departure_time: "2026-10-01 09:15:00", arrival_time: "2026-10-01 11:00:00", price: 3700.00, total_seats: 180 },
    { flight_number: "AI631", source: "Mumbai", destination: "Bangalore", departure_time: "2026-10-01 17:30:00", arrival_time: "2026-10-01 19:15:00", price: 4100.00, total_seats: 180 },
    { flight_number: "SG711", source: "Mumbai", destination: "Hyderabad", departure_time: "2026-10-01 11:00:00", arrival_time: "2026-10-01 12:25:00", price: 3500.00, total_seats: 180 },
    { flight_number: "6E822", source: "Mumbai", destination: "Chennai", departure_time: "2026-10-01 13:00:00", arrival_time: "2026-10-01 15:00:00", price: 4300.00, total_seats: 180 },
    { flight_number: "AI105", source: "Delhi", destination: "Mumbai", departure_time: "2026-10-01 08:00:00", arrival_time: "2026-10-01 10:15:00", price: 5200.00, total_seats: 200 },
    { flight_number: "6E215", source: "Delhi", destination: "Mumbai", departure_time: "2026-10-01 17:00:00", arrival_time: "2026-10-01 19:15:00", price: 4700.00, total_seats: 180 },
    { flight_number: "UK835", source: "Delhi", destination: "Bangalore", departure_time: "2026-10-01 07:00:00", arrival_time: "2026-10-01 09:45:00", price: 5600.00, total_seats: 160 },
    { flight_number: "6E552", source: "Bangalore", destination: "Mumbai", departure_time: "2026-10-01 12:30:00", arrival_time: "2026-10-01 14:15:00", price: 3800.00, total_seats: 180 },
    { flight_number: "QP108", source: "Bangalore", destination: "Delhi", departure_time: "2026-10-01 16:00:00", arrival_time: "2026-10-01 18:45:00", price: 5300.00, total_seats: 180 },
    { flight_number: "6E901", source: "Hyderabad", destination: "Delhi", departure_time: "2026-10-01 10:15:00", arrival_time: "2026-10-01 12:30:00", price: 4500.00, total_seats: 180 },
    { flight_number: "SG402", source: "Delhi", destination: "Goa", departure_time: "2026-10-01 11:00:00", arrival_time: "2026-10-01 13:30:00", price: 6100.00, total_seats: 180 },
    { flight_number: "6E341", source: "Mumbai", destination: "Goa", departure_time: "2026-10-01 15:30:00", arrival_time: "2026-10-01 16:45:00", price: 3200.00, total_seats: 180 }
];

async function seedFlightsIfNecessary() {
    try {
        const [rows] = await db.query("SELECT COUNT(*) AS total FROM flights");
        if (rows[0].total < 15) {
            console.log("✈️  Seeding realistic flights into MySQL flights table...");
            for (const f of sampleFlights) {
                const [existing] = await db.query("SELECT flight_id FROM flights WHERE flight_number = ?", [f.flight_number]);
                if (existing.length === 0) {
                    await db.query(
                        "INSERT INTO flights (flight_number, source, destination, departure_time, arrival_time, price, total_seats, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'SCHEDULED')",
                        [f.flight_number, f.source, f.destination, f.departure_time, f.arrival_time, f.price, f.total_seats]
                    );
                }
            }
            console.log("✅ Realistic flight records successfully seeded into MySQL!");
        }
    } catch (err) {
        console.error("Seeding error:", err.message);
    }
}

// Trigger initializations on startup
(async () => {
    await initAdvancedSchema();
    await seedFlightsIfNecessary();
})();

// Helper to format airline and timings
function enrichFlight(flight) {
    let airlineName = "SkyWings";
    let airlineCode = "SW";
    if (flight.flight_number) {
        const fn = flight.flight_number.toUpperCase();
        if (fn.startsWith("AI")) { airlineName = "Air India"; airlineCode = "AI"; }
        else if (fn.startsWith("6E")) { airlineName = "IndiGo"; airlineCode = "6E"; }
        else if (fn.startsWith("UK")) { airlineName = "Vistara"; airlineCode = "UK"; }
        else if (fn.startsWith("SG")) { airlineName = "SpiceJet"; airlineCode = "SG"; }
        else if (fn.startsWith("QP")) { airlineName = "Akasa Air"; airlineCode = "QP"; }
    }

    const depDate = flight.departure_time ? new Date(flight.departure_time) : new Date();
    const arrDate = flight.arrival_time ? new Date(flight.arrival_time) : new Date(depDate.getTime() + 2 * 3600 * 1000);

    const formatTimeStr = (d) => {
        if (!d || isNaN(d.getTime())) return "08:00 AM";
        let h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, "0");
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
    };

    const diffMs = Math.abs(arrDate - depDate);
    const hours = Math.floor(diffMs / (1000 * 60 * 60)) || 2;
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const duration = `${hours}h ${mins}m`;

    return {
        ...flight,
        airline_name: flight.airline_name || airlineName,
        airline_code: airlineCode,
        duration: flight.duration || duration,
        status: flight.status || "SCHEDULED",
        departure_date: depDate.toISOString().split("T")[0],
        departure_time_formatted: formatTimeStr(depDate),
        arrival_time_formatted: formatTimeStr(arrDate),
        available_seats: flight.available_seats !== undefined ? parseInt(flight.available_seats) : (flight.total_seats || 180)
    };
}

// Generate realistic PNR (e.g. SW8A42K)
function generatePNR(bookingId) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const seed = (bookingId * 7919 + 48271) % 1000000;
    let code = "SW";
    let n = seed;
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(n % chars.length);
        n = Math.floor(n / chars.length) + 7;
    }
    return code;
}

// ==========================================================
// 3. HEALTH CHECK & SYSTEM STATUS
// ==========================================================
app.get("/api/health", async (req, res) => {
    try {
        const [result] = await db.query("SELECT 1 + 1 AS connection_test");
        const [tables] = await db.query("SHOW TABLES");
        const counts = {};
        for (const t of tables) {
            const tableName = Object.values(t)[0];
            const [cnt] = await db.query(`SELECT COUNT(*) AS count FROM \`${tableName}\``);
            counts[tableName] = cnt[0].count;
        }
        res.status(200).json({
            status: "success",
            message: "Backend and MySQL database are connected and working!",
            test: result[0].connection_test,
            tables: tables.map(t => Object.values(t)[0]),
            counts
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: "Database connection failed. Please check MySQL server and .env settings.",
            error: error.message
        });
    }
});

// ==========================================================
// 4. AUTHENTICATION (USER & ADMIN)
// ==========================================================

// Register New User
app.post("/api/register", async (req, res) => {
    const { fullName, email, password, phone, confirmPassword } = req.body;
    const name = fullName || req.body.name;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: "Name, email and password are required." });
    }

    if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    try {
        const [existing] = await db.query("SELECT user_id FROM users WHERE email = ?", [email.trim().toLowerCase()]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: "Email is already registered. Please sign in." });
        }

        const insertQuery = "INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, 'USER')";
        const [result] = await db.query(insertQuery, [name.trim(), email.trim().toLowerCase(), password, phone || '']);

        return res.status(201).json({
            success: true,
            message: "Account created successfully! You can now log in.",
            user: {
                userId: result.insertId,
                fullName: name.trim(),
                name: name.trim(),
                email: email.trim().toLowerCase(),
                role: 'USER'
            }
        });
    } catch (error) {
        console.error("Register Error:", error);
        return res.status(500).json({ success: false, message: "Registration failed.", error: error.message });
    }
});

// Login User
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    try {
        const selectQuery = "SELECT user_id, name, email, role, phone FROM users WHERE email = ? AND password = ?";
        const [rows] = await db.query(selectQuery, [email.trim().toLowerCase(), password]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid email or password." });
        }

        const user = rows[0];
        return res.status(200).json({
            success: true,
            message: `Welcome back, ${user.name}!`,
            user: {
                userId: user.user_id,
                fullName: user.name,
                name: user.name,
                email: user.email,
                role: user.role || 'USER',
                phone: user.phone
            }
        });
    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ success: false, message: "Login failed.", error: error.message });
    }
});

// Admin Login
app.post("/api/admin/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await db.query("SELECT user_id, name, email, role FROM users WHERE email = ? AND password = ? AND role = 'ADMIN'", [email.trim().toLowerCase(), password]);
        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: "Access denied. Valid administrator credentials required." });
        }

        const admin = rows[0];
        return res.status(200).json({
            success: true,
            message: "Administrator authenticated successfully!",
            admin: {
                userId: admin.user_id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Admin authentication error.", error: error.message });
    }
});

// ==========================================================
// 5. FLIGHT SEARCH & FILTERING APIS
// ==========================================================

// Get All Flights
app.get("/api/flights", async (req, res) => {
    try {
        const query = `
            SELECT 
                f.*,
                (f.total_seats - COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.flight_id = f.flight_id), 0)) AS available_seats
            FROM flights f
            ORDER BY f.flight_id ASC
        `;
        const [flights] = await db.query(query);
        return res.status(200).json({ 
            success: true, 
            count: flights.length, 
            flights: flights.map(enrichFlight) 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error fetching flights.", error: error.message });
    }
});

// Search Flights with Filters & Sorting
app.get("/api/flights/search", async (req, res) => {
    const { source, destination, sort, airline, maxPrice, status } = req.query;

    if (!source || !destination) {
        return res.status(400).json({ success: false, message: "Please specify departure and arrival cities." });
    }

    try {
        let orderByClause = "ORDER BY f.price ASC";
        if (sort === "earliest") orderByClause = "ORDER BY TIME(f.departure_time) ASC";
        else if (sort === "latest") orderByClause = "ORDER BY TIME(f.departure_time) DESC";
        else if (sort === "expensive") orderByClause = "ORDER BY f.price DESC";
        else if (sort === "cheapest") orderByClause = "ORDER BY f.price ASC";

        const query = `
            SELECT 
                f.*,
                (f.total_seats - COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.flight_id = f.flight_id), 0)) AS available_seats
            FROM flights f
            WHERE LOWER(f.source) = LOWER(?) AND LOWER(f.destination) = LOWER(?)
            ${orderByClause}
        `;
        
        const [flights] = await db.query(query, [source.trim(), destination.trim()]);
        let enriched = flights.map(enrichFlight);

        if (airline && airline !== "all") {
            enriched = enriched.filter(f => f.airline_name.toLowerCase().includes(airline.toLowerCase()) || f.airline_code.toLowerCase() === airline.toLowerCase());
        }
        if (maxPrice && !isNaN(maxPrice)) {
            enriched = enriched.filter(f => parseFloat(f.price) <= parseFloat(maxPrice));
        }
        if (status && status !== "all") {
            enriched = enriched.filter(f => f.status.toUpperCase() === status.toUpperCase());
        }

        return res.status(200).json({
            success: true,
            count: enriched.length,
            flights: enriched
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error searching flights.", error: error.message });
    }
});

// Get Single Flight by ID
app.get("/api/flights/:id", async (req, res) => {
    try {
        const query = `
            SELECT 
                f.*,
                (f.total_seats - COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.flight_id = f.flight_id), 0)) AS available_seats
            FROM flights f
            WHERE f.flight_id = ?
        `;
        const [rows] = await db.query(query, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Flight not found." });
        return res.status(200).json({ success: true, flight: enrichFlight(rows[0]) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error retrieving flight.", error: error.message });
    }
});

// Distinct Cities
app.get("/api/cities", async (req, res) => {
    try {
        const query = `SELECT DISTINCT source AS city FROM flights UNION SELECT DISTINCT destination AS city FROM flights ORDER BY city ASC`;
        const [rows] = await db.query(query);
        return res.status(200).json({ success: true, cities: rows.map(r => r.city) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error fetching cities.", error: error.message });
    }
});

// ==========================================================
// 6. REAL SEAT SELECTION APIS
// ==========================================================

// Get Seat Map for Flight (Auto-initializes rows 1-20 if missing, cross-references bookings)
app.get("/api/flights/:id/seats", async (req, res) => {
    const flightId = req.params.id;
    try {
        // Check existing seats in `seats` table
        let [seatRows] = await db.query("SELECT seat_number, seat_class, status FROM seats WHERE flight_id = ? ORDER BY seat_id ASC", [flightId]);

        // If no seats yet, generate 120 seats: Rows 1-20, Columns A,B,C, D,E,F
        if (seatRows.length === 0) {
            const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
            const insertValues = [];
            for (let r = 1; r <= 20; r++) {
                const sClass = r <= 3 ? "Business" : (r <= 6 ? "Premium Economy" : "Economy");
                for (const c of cols) {
                    insertValues.push([flightId, `${r}${c}`, sClass, 'AVAILABLE']);
                }
            }
            await db.query("INSERT INTO seats (flight_id, seat_number, seat_class, status) VALUES ?", [insertValues]);

            // Sync with existing bookings in `bookings` table
            const [bookedSeats] = await db.query("SELECT seat_no FROM bookings WHERE flight_id = ?", [flightId]);
            for (const b of bookedSeats) {
                if (b.seat_no) {
                    await db.query("UPDATE seats SET status = 'BOOKED' WHERE flight_id = ? AND seat_number = ?", [flightId, b.seat_no]);
                }
            }

            [seatRows] = await db.query("SELECT seat_number, seat_class, status FROM seats WHERE flight_id = ? ORDER BY seat_id ASC", [flightId]);
        }

        return res.status(200).json({ success: true, count: seatRows.length, seats: seatRows });
    } catch (error) {
        console.error("Seat Map Error:", error);
        return res.status(500).json({ success: false, message: "Error fetching seat map.", error: error.message });
    }
});

// ==========================================================
// 7. TRANSACTIONAL BOOKING & PAYMENT MODULE (ACID COMPLIANT)
// ==========================================================
app.post("/api/bookings", async (req, res) => {
    const { userId, flightId, travelClass, passengers, paymentMethod } = req.body;

    if (!userId || !flightId) {
        return res.status(400).json({ success: false, message: "User ID and Flight ID are required." });
    }

    let passengerList = [];
    if (Array.isArray(passengers) && passengers.length > 0) passengerList = passengers;
    else if (req.body.passengerName) {
        passengerList = [{
            name: req.body.passengerName,
            age: req.body.age,
            gender: req.body.gender,
            passportNo: req.body.passportNo,
            seatNumber: req.body.seatNumber
        }];
    } else {
        return res.status(400).json({ success: false, message: "Passenger details required." });
    }

    // Start Real MySQL Database Transaction
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // Step 1: Lock & Verify flight availability
        const [flightRows] = await conn.query(
            "SELECT flight_id, flight_number, source, destination, departure_time, arrival_time, price, total_seats FROM flights WHERE flight_id = ? FOR UPDATE",
            [flightId]
        );

        if (flightRows.length === 0) {
            await conn.rollback();
            conn.release();
            return res.status(404).json({ success: false, message: "Flight not found." });
        }

        const flight = flightRows[0];
        const [bookingCount] = await conn.query("SELECT COUNT(*) AS booked FROM bookings WHERE flight_id = ?", [flightId]);
        const availableSeats = flight.total_seats - bookingCount[0].booked;

        if (availableSeats < passengerList.length) {
            await conn.rollback();
            conn.release();
            return res.status(400).json({ success: false, message: `Only ${availableSeats} seat(s) available on this flight.` });
        }

        // Price calculation
        let classMultiplier = 1.0;
        const chosenClass = (travelClass || "Economy").toUpperCase();
        if (chosenClass.includes("PREMIUM")) classMultiplier = 1.35;
        else if (chosenClass.includes("BUSINESS")) classMultiplier = 2.2;
        else if (chosenClass.includes("FIRST")) classMultiplier = 3.5;

        const baseFare = Math.round(parseFloat(flight.price) * classMultiplier);
        const totalFare = baseFare * passengerList.length;

        const confirmedPassengers = [];
        let primaryBookingId = null;

        for (let i = 0; i < passengerList.length; i++) {
            const p = passengerList[i];
            const seat = p.seatNumber && p.seatNumber.trim() !== "" 
                ? p.seatNumber.trim().toUpperCase() 
                : `${Math.floor(Math.random() * 20) + 1}${['A', 'B', 'C', 'D', 'E', 'F'][i % 6]}`;

            // Check if seat is already booked (prevent double booking)
            const [seatCheck] = await conn.query("SELECT status FROM seats WHERE flight_id = ? AND seat_number = ?", [flightId, seat]);
            if (seatCheck.length > 0 && seatCheck[0].status === "BOOKED") {
                await conn.rollback();
                conn.release();
                return res.status(409).json({ success: false, message: `Seat ${seat} was just reserved by another user. Please choose another seat.` });
            }

            // Insert Passenger
            const [pRes] = await conn.query(
                "INSERT INTO passengers (name, age, gender, passport_no) VALUES (?, ?, ?, ?)",
                [p.name.trim(), parseInt(p.age), p.gender, p.passportNo || `IN${Math.floor(1000000 + Math.random() * 9000000)}`]
            );
            const passengerId = pRes.insertId;

            // Insert Booking
            const [bRes] = await conn.query(
                "INSERT INTO bookings (user_id, passenger_id, flight_id, seat_no, booking_date) VALUES (?, ?, ?, ?, NOW())",
                [userId, passengerId, flightId, seat]
            );
            const bookingId = bRes.insertId;
            if (i === 0) primaryBookingId = bookingId;

            // Update Seat status in seats table to BOOKED
            await conn.query(
                "INSERT INTO seats (flight_id, seat_number, seat_class, status) VALUES (?, ?, ?, 'BOOKED') ON DUPLICATE KEY UPDATE status = 'BOOKED'",
                [flightId, seat, travelClass || 'Economy']
            );

            // Record simulated payment
            const txnId = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            await conn.query(
                "INSERT INTO payments (booking_id, transaction_id, amount, payment_method, payment_status) VALUES (?, ?, ?, ?, 'SUCCESS')",
                [bookingId, txnId, baseFare, paymentMethod || 'Credit Card']
            );

            confirmedPassengers.push({ bookingId, passengerId, name: p.name.trim(), seatNumber: seat });
        }

        const pnr = generatePNR(primaryBookingId);
        const enriched = enrichFlight(flight);

        // Insert In-app Notification for the user
        await conn.query(
            "INSERT INTO notifications (user_id, booking_id, message, notification_type) VALUES (?, ?, ?, 'BOOKING_CONFIRMED')",
            [userId, primaryBookingId, `Booking Confirmed! Flight ${flight.flight_number} (${flight.source} to ${flight.destination}). PNR: ${pnr}`]
        );

        // Commit Transaction
        await conn.commit();
        conn.release();

        return res.status(201).json({
            success: true,
            message: "Ticket booked and payment processed successfully!",
            booking: {
                bookingId: primaryBookingId,
                pnr,
                status: "CONFIRMED",
                travelClass: travelClass || "Economy",
                paymentMethod: paymentMethod || "Credit Card",
                totalFare,
                flightNumber: flight.flight_number,
                airlineName: enriched.airline_name,
                source: flight.source,
                destination: flight.destination,
                departureDate: enriched.departure_date,
                departureTime: enriched.departure_time_formatted,
                arrivalTime: enriched.arrival_time_formatted,
                duration: enriched.duration,
                passengers: confirmedPassengers
            }
        });
    } catch (error) {
        await conn.rollback();
        conn.release();
        console.error("Transactional Booking Error:", error);
        return res.status(500).json({ success: false, message: "Booking transaction failed. Rolled back.", error: error.message });
    }
});

// ==========================================================
// 8. MY BOOKINGS (4-TABLE SQL JOIN) & TICKET DETAILS
// ==========================================================

app.get("/api/bookings/user/:userId", async (req, res) => {
    const userId = req.params.userId;
    try {
        const joinQuery = `
            SELECT 
                b.booking_id,
                b.seat_no,
                b.seat_no AS seat_number,
                b.booking_date,
                'CONFIRMED' AS status,
                f.price AS total_fare,
                u.user_id,
                u.name AS user_name,
                u.email AS user_email,
                f.flight_id,
                f.flight_number,
                f.source,
                f.destination,
                f.departure_time,
                f.arrival_time,
                f.status AS flight_status,
                p.passenger_id,
                p.name AS passenger_name,
                p.age,
                p.gender,
                p.passport_no,
                COALESCE(pm.payment_status, 'SUCCESS') AS payment_status,
                COALESCE(pm.transaction_id, 'TXN-ONLINE') AS transaction_id
            FROM bookings b
            JOIN users u ON b.user_id = u.user_id
            JOIN flights f ON b.flight_id = f.flight_id
            JOIN passengers p ON b.passenger_id = p.passenger_id
            LEFT JOIN payments pm ON b.booking_id = pm.booking_id
            WHERE b.user_id = ?
            ORDER BY b.booking_id DESC;
        `;

        const [bookings] = await db.query(joinQuery, [userId]);
        return res.status(200).json({
            success: true,
            count: bookings.length,
            bookings: bookings.map(b => {
                const enriched = enrichFlight(b);
                return {
                    ...b,
                    pnr: generatePNR(b.booking_id),
                    airline_name: enriched.airline_name,
                    departure_date: enriched.departure_date,
                    departure_time_formatted: enriched.departure_time_formatted,
                    arrival_time_formatted: enriched.arrival_time_formatted,
                    flight_status: b.flight_status || "SCHEDULED"
                };
            })
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error fetching bookings.", error: error.message });
    }
});

// PNR Search API (Public & Live Lookup)
app.get("/api/pnr/:pnr", async (req, res) => {
    const pnrInput = req.params.pnr.trim().toUpperCase();

    try {
        const [bookings] = await db.query(`
            SELECT 
                b.booking_id,
                b.seat_no,
                b.booking_date,
                u.name AS user_name,
                f.flight_number,
                f.source,
                f.destination,
                f.departure_time,
                f.arrival_time,
                f.price,
                f.status AS flight_status,
                p.name AS passenger_name,
                p.age,
                p.gender,
                COALESCE(pm.payment_status, 'SUCCESS') AS payment_status,
                COALESCE(pm.transaction_id, 'TXN-ONLINE') AS transaction_id
            FROM bookings b
            JOIN users u ON b.user_id = u.user_id
            JOIN flights f ON b.flight_id = f.flight_id
            JOIN passengers p ON b.passenger_id = p.passenger_id
            LEFT JOIN payments pm ON b.booking_id = pm.booking_id
        `);

        // Match PNR algorithmically
        const matched = bookings.find(b => generatePNR(b.booking_id) === pnrInput);
        if (!matched) {
            return res.status(404).json({ success: false, message: `No active booking found for PNR "${pnrInput}".` });
        }

        const enriched = enrichFlight(matched);
        return res.status(200).json({
            success: true,
            booking: {
                ...matched,
                pnr: pnrInput,
                status: "CONFIRMED",
                airline_name: enriched.airline_name,
                departure_date: enriched.departure_date,
                departure_time_formatted: enriched.departure_time_formatted,
                arrival_time_formatted: enriched.arrival_time_formatted,
                total_fare: matched.price
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error searching PNR.", error: error.message });
    }
});

// ==========================================================
// 9. CANCELLATION & REFUND SYSTEM (WITH WAITLIST PROMOTION)
// ==========================================================
app.delete("/api/bookings/:bookingId", async (req, res) => {
    const bookingId = req.params.bookingId;
    const userId = req.query.userId || req.body?.userId;

    try {
        // Retrieve booking, flight, and seat
        const [bRows] = await db.query(
            "SELECT b.booking_id, b.user_id, b.flight_id, b.passenger_id, b.seat_no, f.departure_time, f.price, f.flight_number, f.source, f.destination FROM bookings b JOIN flights f ON b.flight_id = f.flight_id WHERE b.booking_id = ?",
            [bookingId]
        );

        if (bRows.length === 0) {
            return res.status(404).json({ success: false, message: "Booking not found or already cancelled." });
        }

        const b = bRows[0];

        // Refund calculation based on time before departure
        const depTime = new Date(b.departure_time).getTime();
        const now = Date.now();
        const hoursBefore = (depTime - now) / (1000 * 60 * 60);

        let refundPercentage = 0.50; // < 24h default
        if (hoursBefore > 48) refundPercentage = 0.90;
        else if (hoursBefore >= 24) refundPercentage = 0.75;

        const originalFare = parseFloat(b.price) || 5000;
        const refundAmount = Math.round(originalFare * refundPercentage);
        const refundTxn = `REF-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Record refund
        await db.query(
            "INSERT INTO refunds (booking_id, transaction_id, refund_amount, refund_status) VALUES (?, ?, ?, 'PROCESSED')",
            [bookingId, refundTxn, refundAmount]
        );

        // Restore seat status in seats table to AVAILABLE
        if (b.seat_no) {
            await db.query("UPDATE seats SET status = 'AVAILABLE' WHERE flight_id = ? AND seat_number = ?", [b.flight_id, b.seat_no]);
        }

        // Waitlist FIFO Promotion: Check if anyone is waiting for this flight
        const [waitingList] = await db.query(
            "SELECT * FROM waitlist WHERE flight_id = ? AND status = 'WAITING' ORDER BY waitlist_id ASC LIMIT 1",
            [b.flight_id]
        );

        if (waitingList.length > 0) {
            const promoted = waitingList[0];
            await db.query("UPDATE waitlist SET status = 'CONFIRMED' WHERE waitlist_id = ?", [promoted.waitlist_id]);
            await db.query(
                "INSERT INTO notifications (user_id, message, notification_type) VALUES (?, ?, 'WAITLIST_CONFIRMED')",
                [promoted.user_id, `Seat available! Your waitlist reservation on flight ${b.flight_number} has been promoted to CONFIRMED.`]
            );
        }

        // Delete booking and passenger records
        await db.query("DELETE FROM bookings WHERE booking_id = ?", [bookingId]);
        if (b.passenger_id) {
            await db.query("DELETE FROM passengers WHERE passenger_id = ?", [b.passenger_id]);
        }

        // Notify user about cancellation and refund
        await db.query(
            "INSERT INTO notifications (user_id, message, notification_type) VALUES (?, ?, 'TICKET_CANCELLED')",
            [b.user_id, `Your ticket on ${b.flight_number} (${b.source} to ${b.destination}) has been cancelled. Refund of ₹${refundAmount} (${refundPercentage * 100}%) has been processed.`]
        );

        return res.status(200).json({
            success: true,
            message: `Booking #${bookingId} cancelled. Refund of ₹${refundAmount.toLocaleString()} (${refundPercentage * 100}%) processed. Seat restored.`,
            refundAmount,
            refundTxn
        });
    } catch (error) {
        console.error("Cancel Error:", error);
        return res.status(500).json({ success: false, message: "Cancellation failed.", error: error.message });
    }
});

// ==========================================================
// 10. WAITLIST SYSTEM APIS
// ==========================================================
app.post("/api/flights/:id/waitlist", async (req, res) => {
    const flightId = req.params.id;
    const { userId, passengerName, email, phone } = req.body;

    if (!userId || !passengerName) {
        return res.status(400).json({ success: false, message: "User ID and Passenger Name required." });
    }

    try {
        const [countRow] = await db.query("SELECT COUNT(*) AS total FROM waitlist WHERE flight_id = ? AND status = 'WAITING'", [flightId]);
        const position = countRow[0].total + 1;

        await db.query(
            "INSERT INTO waitlist (flight_id, user_id, passenger_name, passenger_email, passenger_phone, position, status) VALUES (?, ?, ?, ?, ?, ?, 'WAITING')",
            [flightId, userId, passengerName.trim(), email || '', phone || '', position]
        );

        await db.query(
            "INSERT INTO notifications (user_id, message, notification_type) VALUES (?, ?, 'WAITLIST_JOINED')",
            [userId, `Joined waitlist at position #${position} for flight.`]
        );

        return res.status(201).json({
            success: true,
            message: `You have successfully joined the waitlist at position #${position}!`,
            position
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to join waitlist.", error: error.message });
    }
});

// ==========================================================
// 11. NOTIFICATION SYSTEM APIS
// ==========================================================
app.get("/api/notifications/:userId", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            [req.params.userId]
        );
        const unreadCount = rows.filter(n => !n.is_read).length;
        return res.status(200).json({ success: true, count: rows.length, unreadCount, notifications: rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error fetching notifications.", error: error.message });
    }
});

app.put("/api/notifications/:id/read", async (req, res) => {
    try {
        await db.query("UPDATE notifications SET is_read = TRUE WHERE notification_id = ?", [req.params.id]);
        return res.status(200).json({ success: true, message: "Marked as read." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error updating notification." });
    }
});

app.put("/api/notifications/user/:userId/read-all", async (req, res) => {
    try {
        await db.query("UPDATE notifications SET is_read = TRUE WHERE user_id = ?", [req.params.userId]);
        return res.status(200).json({ success: true, message: "All notifications marked as read." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error updating notifications." });
    }
});

// ==========================================================
// 12. ADMIN DASHBOARD & MANAGEMENT APIS
// ==========================================================

// Dashboard SQL Aggregate Statistics
app.get("/api/admin/stats", async (req, res) => {
    try {
        const [userCnt] = await db.query("SELECT COUNT(*) AS total FROM users");
        const [flightCnt] = await db.query("SELECT COUNT(*) AS total FROM flights");
        const [bookingCnt] = await db.query("SELECT COUNT(*) AS total FROM bookings");
        const [revenueRow] = await db.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE payment_status = 'SUCCESS'");
        const [waitlistCnt] = await db.query("SELECT COUNT(*) AS total FROM waitlist WHERE status = 'WAITING'");
        const [refundCnt] = await db.query("SELECT COUNT(*) AS total FROM refunds");

        return res.status(200).json({
            success: true,
            stats: {
                totalUsers: userCnt[0].total,
                totalFlights: flightCnt[0].total,
                totalBookings: bookingCnt[0].total,
                totalRevenue: parseFloat(revenueRow[0].total),
                waitlistedPassengers: waitlistCnt[0].total,
                cancelledBookings: refundCnt[0].total
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error calculating statistics.", error: error.message });
    }
});

// Admin Reports Analytics
app.get("/api/admin/reports/summary", async (req, res) => {
    try {
        // Popular Routes
        const [popularRoutes] = await db.query(`
            SELECT f.source, f.destination, COUNT(b.booking_id) AS total_bookings, COALESCE(SUM(f.price), 0) AS route_revenue
            FROM flights f
            LEFT JOIN bookings b ON f.flight_id = b.flight_id
            GROUP BY f.source, f.destination
            ORDER BY total_bookings DESC
            LIMIT 5
        `);

        // Flight-wise occupancy
        const [flightWise] = await db.query(`
            SELECT f.flight_number, f.source, f.destination, f.total_seats,
                   COUNT(b.booking_id) AS booked_seats,
                   ROUND((COUNT(b.booking_id) / f.total_seats) * 100, 1) AS occupancy_pct
            FROM flights f
            LEFT JOIN bookings b ON f.flight_id = b.flight_id
            GROUP BY f.flight_id
            ORDER BY booked_seats DESC
            LIMIT 6
        `);

        return res.status(200).json({
            success: true,
            popularRoutes,
            flightWise
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error generating reports.", error: error.message });
    }
});

// Admin Flights CRUD
app.post("/api/admin/flights", async (req, res) => {
    const { flight_number, source, destination, departure_time, arrival_time, price, total_seats, status } = req.body;
    try {
        const [r] = await db.query(
            "INSERT INTO flights (flight_number, source, destination, departure_time, arrival_time, price, total_seats, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [flight_number.trim().toUpperCase(), source.trim(), destination.trim(), departure_time, arrival_time, price, total_seats || 180, status || 'SCHEDULED']
        );
        return res.status(201).json({ success: true, message: `Flight ${flight_number} added successfully.`, flightId: r.insertId });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to add flight.", error: error.message });
    }
});

app.put("/api/admin/flights/:id", async (req, res) => {
    const { flight_number, source, destination, price, total_seats, status } = req.body;
    try {
        await db.query(
            "UPDATE flights SET flight_number = ?, source = ?, destination = ?, price = ?, total_seats = ?, status = ? WHERE flight_id = ?",
            [flight_number, source, destination, price, total_seats, status, req.params.id]
        );
        return res.status(200).json({ success: true, message: "Flight updated successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to update flight.", error: error.message });
    }
});

app.delete("/api/admin/flights/:id", async (req, res) => {
    const flightId = req.params.id;
    try {
        // Safe check for active bookings
        const [active] = await db.query("SELECT COUNT(*) AS total FROM bookings WHERE flight_id = ?", [flightId]);
        if (active[0].total > 0) {
            return res.status(409).json({ 
                success: false, 
                message: `Cannot delete flight. It has ${active[0].total} active booking(s). Please cancel or reschedule them first.` 
            });
        }
        await db.query("DELETE FROM flights WHERE flight_id = ?", [flightId]);
        return res.status(200).json({ success: true, message: "Flight deleted safely from database." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to delete flight.", error: error.message });
    }
});

// Admin Update Flight Status & Trigger Passenger Notifications
app.put("/api/admin/flights/:id/status", async (req, res) => {
    const flightId = req.params.id;
    const { status } = req.body;

    try {
        await db.query("UPDATE flights SET status = ? WHERE flight_id = ?", [status, flightId]);
        const [fRows] = await db.query("SELECT flight_number, source, destination FROM flights WHERE flight_id = ?", [flightId]);

        // If status is DELAYED or CANCELLED, automatically notify all ticket holders!
        if (status === "DELAYED" || status === "CANCELLED") {
            const [passengers] = await db.query("SELECT DISTINCT user_id FROM bookings WHERE flight_id = ?", [flightId]);
            const msg = `Notice: Your flight ${fRows[0].flight_number} (${fRows[0].source} to ${fRows[0].destination}) has been marked as ${status}.`;
            for (const p of passengers) {
                await db.query(
                    "INSERT INTO notifications (user_id, message, notification_type) VALUES (?, ?, ?)",
                    [p.user_id, msg, `FLIGHT_${status}`]
                );
            }
        }

        return res.status(200).json({ success: true, message: `Flight status updated to ${status}.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error updating flight status." });
    }
});

// Admin Airports CRUD
app.get("/api/admin/airports", async (req, res) => {
    try {
        const [airports] = await db.query("SELECT * FROM airports ORDER BY city ASC");
        return res.status(200).json({ success: true, airports });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error fetching airports." });
    }
});

app.post("/api/admin/airports", async (req, res) => {
    const { airport_code, airport_name, city, state, country } = req.body;
    try {
        await db.query(
            "INSERT INTO airports (airport_code, airport_name, city, state, country) VALUES (?, ?, ?, ?, ?)",
            [airport_code.toUpperCase(), airport_name, city, state || '', country || 'India']
        );
        return res.status(201).json({ success: true, message: "Airport added successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error adding airport.", error: error.message });
    }
});

app.delete("/api/admin/airports/:id", async (req, res) => {
    try {
        await db.query("DELETE FROM airports WHERE airport_id = ?", [req.params.id]);
        return res.status(200).json({ success: true, message: "Airport removed." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error deleting airport." });
    }
});

// Admin Aircraft CRUD
app.get("/api/admin/aircraft", async (req, res) => {
    try {
        const [aircraft] = await db.query("SELECT * FROM aircraft ORDER BY aircraft_id ASC");
        return res.status(200).json({ success: true, aircraft });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error fetching aircraft." });
    }
});

app.post("/api/admin/aircraft", async (req, res) => {
    const { aircraft_number, aircraft_type, total_seats, airline } = req.body;
    try {
        await db.query(
            "INSERT INTO aircraft (aircraft_number, aircraft_type, total_seats, airline) VALUES (?, ?, ?, ?)",
            [aircraft_number.toUpperCase(), aircraft_type, total_seats || 180, airline]
        );
        return res.status(201).json({ success: true, message: "Aircraft added successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error adding aircraft.", error: error.message });
    }
});

app.delete("/api/admin/aircraft/:id", async (req, res) => {
    try {
        await db.query("DELETE FROM aircraft WHERE aircraft_id = ?", [req.params.id]);
        return res.status(200).json({ success: true, message: "Aircraft removed." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error deleting aircraft." });
    }
});

// Admin Users Management (Passwords never exposed!)
app.get("/api/admin/users", async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT user_id, name, email, phone, role, is_active, created_at FROM users ORDER BY user_id DESC"
        );
        return res.status(200).json({ success: true, count: users.length, users });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error fetching users." });
    }
});

app.put("/api/admin/users/:id/role", async (req, res) => {
    const { role } = req.body;
    try {
        await db.query("UPDATE users SET role = ? WHERE user_id = ?", [role, req.params.id]);
        return res.status(200).json({ success: true, message: "User role updated successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error updating role." });
    }
});

// Admin View All System Bookings
app.get("/api/admin/bookings", async (req, res) => {
    try {
        const [allBookings] = await db.query(`
            SELECT 
                b.booking_id,
                b.seat_no,
                b.booking_date,
                u.name AS user_name,
                u.email AS user_email,
                f.flight_number,
                f.source,
                f.destination,
                f.price,
                f.status AS flight_status,
                p.name AS passenger_name,
                p.age,
                p.gender,
                COALESCE(pm.payment_status, 'SUCCESS') AS payment_status,
                COALESCE(pm.transaction_id, 'TXN-ONLINE') AS transaction_id
            FROM bookings b
            JOIN users u ON b.user_id = u.user_id
            JOIN flights f ON b.flight_id = f.flight_id
            JOIN passengers p ON b.passenger_id = p.passenger_id
            LEFT JOIN payments pm ON b.booking_id = pm.booking_id
            ORDER BY b.booking_id DESC
        `);

        return res.status(200).json({
            success: true,
            count: allBookings.length,
            bookings: allBookings.map(b => ({
                ...b,
                pnr: generatePNR(b.booking_id)
            }))
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Error loading all bookings." });
    }
});

// Fallback SPA routing
app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

// Start Server
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`✈️  SkyWings Advanced Airline Backend on port ${PORT}`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
