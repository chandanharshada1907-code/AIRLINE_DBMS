-- ==========================================================
-- SKYWINGS AIRLINE RESERVATION & MANAGEMENT SYSTEM
-- ADVANCED DBMS COLLEGE PROJECT SQL SCRIPT
-- Database: MySQL 8.0+
-- Port: 5050 (Backend: Node.js + Express + mysql2)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS airline_db;
USE airline_db;

-- ==========================================================
-- 1. DROP EXISTING CONSTRAINTS & TABLES (SAFE ORDER)
-- ==========================================================
DROP VIEW IF EXISTS view_booking_details;
DROP VIEW IF EXISTS view_available_flights;

DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS waitlist;
DROP TABLE IF EXISTS seats;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS passengers;
DROP TABLE IF EXISTS flights;
DROP TABLE IF EXISTS aircraft;
DROP TABLE IF EXISTS airports;
DROP TABLE IF EXISTS users;

-- ==========================================================
-- 2. CREATE RELATIONAL TABLES (NORMALIZATION: 3NF)
-- ==========================================================

-- Table 1: users (User & Admin Accounts)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) DEFAULT '',
    role ENUM('USER', 'ADMIN') DEFAULT 'USER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: airports (Domestic Airports Directory)
CREATE TABLE airports (
    airport_id INT AUTO_INCREMENT PRIMARY KEY,
    airport_code VARCHAR(10) NOT NULL UNIQUE,
    airport_name VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India'
);

-- Table 3: aircraft (Operating Aircraft Fleet)
CREATE TABLE aircraft (
    aircraft_id INT AUTO_INCREMENT PRIMARY KEY,
    aircraft_number VARCHAR(20) NOT NULL UNIQUE,
    aircraft_type VARCHAR(50) NOT NULL,
    total_seats INT DEFAULT 180,
    airline VARCHAR(50) NOT NULL
);

-- Table 4: flights (Scheduled Commercial Routes)
CREATE TABLE flights (
    flight_id INT AUTO_INCREMENT PRIMARY KEY,
    flight_number VARCHAR(20) NOT NULL UNIQUE,
    source VARCHAR(100) NOT NULL,
    destination VARCHAR(100) NOT NULL,
    departure_time DATETIME NOT NULL,
    arrival_time DATETIME NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total_seats INT NOT NULL DEFAULT 180,
    status ENUM('SCHEDULED', 'DELAYED', 'CANCELLED', 'DEPARTED', 'ARRIVED') DEFAULT 'SCHEDULED'
);

-- Table 5: passengers (Traveler Profiles)
CREATE TABLE passengers (
    passenger_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(20) NOT NULL,
    passport_no VARCHAR(50)
);

-- Table 6: bookings (Relational Bookings linking User, Flight, Passenger)
CREATE TABLE bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    passenger_id INT NOT NULL,
    flight_id INT NOT NULL,
    seat_no VARCHAR(10) NOT NULL,
    booking_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id) ON DELETE CASCADE,
    FOREIGN KEY (flight_id) REFERENCES flights(flight_id) ON DELETE CASCADE
);

-- Table 7: seats (Physical Aircraft Cabin Seats & State Machine)
CREATE TABLE seats (
    seat_id INT AUTO_INCREMENT PRIMARY KEY,
    flight_id INT NOT NULL,
    seat_number VARCHAR(10) NOT NULL,
    seat_class VARCHAR(20) DEFAULT 'Economy',
    status ENUM('AVAILABLE', 'BOOKED') DEFAULT 'AVAILABLE',
    FOREIGN KEY (flight_id) REFERENCES flights(flight_id) ON DELETE CASCADE,
    UNIQUE KEY unique_flight_seat (flight_id, seat_number)
);

-- Table 8: payments (Simulated Financial Transactions)
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    transaction_id VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL,
    payment_status ENUM('SUCCESS', 'FAILED', 'PENDING') DEFAULT 'SUCCESS',
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
);

-- Table 9: refunds (Tiered Cancellation Refunds)
CREATE TABLE refunds (
    refund_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    transaction_id VARCHAR(50) NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    refund_status ENUM('PROCESSED', 'PENDING') DEFAULT 'PROCESSED',
    refund_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 10: waitlist (FIFO Queue for Full Flights)
CREATE TABLE waitlist (
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
);

-- Table 11: notifications (User In-App Notifications)
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    booking_id INT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) DEFAULT 'GENERAL',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ==========================================================
-- 3. SQL VIEWS (VIVA DEMONSTRATION)
-- ==========================================================

-- View 1: view_available_flights (Live available seat counts)
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
FROM flights f;

-- View 2: view_booking_details (Master 5-Table Relational Join)
CREATE OR REPLACE VIEW view_booking_details AS
SELECT 
    b.booking_id,
    b.seat_no,
    b.booking_date,
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
    pm.amount AS total_fare_paid,
    pm.payment_method,
    pm.payment_status,
    pm.transaction_id
FROM bookings b
JOIN users u ON b.user_id = u.user_id
JOIN flights f ON b.flight_id = f.flight_id
JOIN passengers p ON b.passenger_id = p.passenger_id
LEFT JOIN payments pm ON b.booking_id = pm.booking_id;

-- ==========================================================
-- 4. STORED PROCEDURES
-- ==========================================================

DELIMITER //

-- Procedure 1: search_available_flights
CREATE PROCEDURE sp_search_flights(
    IN p_source VARCHAR(100),
    IN p_destination VARCHAR(100)
)
BEGIN
    SELECT 
        f.flight_id,
        f.flight_number,
        f.source,
        f.destination,
        f.departure_time,
        f.arrival_time,
        f.price,
        f.total_seats,
        f.status,
        (f.total_seats - (SELECT COUNT(*) FROM bookings b WHERE b.flight_id = f.flight_id)) AS available_seats
    FROM flights f
    WHERE LOWER(f.source) = LOWER(p_source) AND LOWER(f.destination) = LOWER(p_destination)
    ORDER BY f.price ASC;
END //

-- Procedure 2: get_flight_statistics
CREATE PROCEDURE sp_get_flight_statistics()
BEGIN
    SELECT 
        COUNT(DISTINCT u.user_id) AS total_users,
        COUNT(DISTINCT f.flight_id) AS total_flights,
        COUNT(DISTINCT b.booking_id) AS total_bookings,
        COALESCE(SUM(pm.amount), 0) AS total_revenue
    FROM flights f
    LEFT JOIN bookings b ON f.flight_id = b.flight_id
    LEFT JOIN payments pm ON b.booking_id = pm.booking_id AND pm.payment_status = 'SUCCESS'
    LEFT JOIN users u ON u.role = 'USER';
END //

DELIMITER ;

-- ==========================================================
-- 5. SAMPLE SEED DATA
-- ==========================================================

-- Seed Airports
INSERT INTO airports (airport_code, airport_name, city, state, country) VALUES
('PNQ', 'Pune International Airport', 'Pune', 'Maharashtra', 'India'),
('DEL', 'Indira Gandhi International Airport', 'Delhi', 'Delhi', 'India'),
('BOM', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai', 'Maharashtra', 'India'),
('BLR', 'Kempegowda International Airport', 'Bangalore', 'Karnataka', 'India'),
('HYD', 'Rajiv Gandhi International Airport', 'Hyderabad', 'Telangana', 'India'),
('MAA', 'Chennai International Airport', 'Chennai', 'Tamil Nadu', 'India'),
('GOI', 'Dabolim Airport', 'Goa', 'Goa', 'India');

-- Seed Aircraft Fleet
INSERT INTO aircraft (aircraft_number, aircraft_type, total_seats, airline) VALUES
('VT-INA', 'Airbus A320neo', 180, 'IndiGo'),
('VT-EXA', 'Boeing 737-800', 186, 'Air India'),
('VT-VTA', 'Airbus A321neo', 192, 'Vistara'),
('VT-SGA', 'Boeing 737 MAX 8', 189, 'SpiceJet'),
('VT-QPA', 'Boeing 737 MAX', 189, 'Akasa Air');

-- Seed Users (Including Administrator)
INSERT INTO users (user_id, name, email, password, phone, role) VALUES
(1, 'Rahul Sharma', 'rahul@example.com', 'rahul123', '9876543210', 'USER'),
(2, 'Priya Patel', 'priya@example.com', 'priya123', '9876543211', 'USER'),
(3, 'Amit Verma', 'amit@example.com', 'amit123', '9876543212', 'USER'),
(4, 'SkyWings Administrator', 'admin@skywings.com', 'admin123', '9999900000', 'ADMIN');

-- 25 Realistic Domestic Flights
INSERT INTO flights (flight_id, flight_number, source, destination, departure_time, arrival_time, price, total_seats, status) VALUES
(1, 'AI101', 'Pune', 'Delhi', '2026-10-01 06:00:00', '2026-10-01 08:15:00', 5500.00, 180, 'SCHEDULED'),
(2, '6E201', 'Pune', 'Delhi', '2026-10-01 11:30:00', '2026-10-01 13:45:00', 4800.00, 180, 'SCHEDULED'),
(3, 'UK501', 'Pune', 'Delhi', '2026-10-01 18:00:00', '2026-10-01 20:15:00', 6200.00, 160, 'SCHEDULED'),
(4, '6E305', 'Pune', 'Mumbai', '2026-10-01 07:15:00', '2026-10-01 08:10:00', 2800.00, 150, 'SCHEDULED'),
(5, 'AI205', 'Pune', 'Mumbai', '2026-10-01 16:45:00', '2026-10-01 17:40:00', 3100.00, 180, 'SCHEDULED'),
(6, '6E412', 'Pune', 'Bangalore', '2026-10-01 08:30:00', '2026-10-01 10:05:00', 4200.00, 180, 'SCHEDULED'),
(7, 'SG401', 'Pune', 'Bangalore', '2026-10-01 15:20:00', '2026-10-01 16:55:00', 3900.00, 180, 'SCHEDULED'),
(8, 'AI102', 'Pune', 'Hyderabad', '2026-10-01 09:00:00', '2026-10-01 10:15:00', 3600.00, 180, 'SCHEDULED'),
(9, '6E521', 'Pune', 'Hyderabad', '2026-10-01 19:40:00', '2026-10-01 20:55:00', 3400.00, 180, 'SCHEDULED'),
(10, 'UK510', 'Pune', 'Chennai', '2026-10-01 07:45:00', '2026-10-01 09:35:00', 4900.00, 160, 'SCHEDULED'),
(11, 'AI302', 'Mumbai', 'Delhi', '2026-10-01 06:30:00', '2026-10-01 08:45:00', 5100.00, 200, 'SCHEDULED'),
(12, '6E601', 'Mumbai', 'Delhi', '2026-10-01 14:15:00', '2026-10-01 16:30:00', 4600.00, 180, 'SCHEDULED'),
(13, 'UK815', 'Mumbai', 'Delhi', '2026-10-01 20:00:00', '2026-10-01 22:15:00', 5800.00, 160, 'SCHEDULED'),
(14, '6E702', 'Mumbai', 'Bangalore', '2026-10-01 09:15:00', '2026-10-01 11:00:00', 3700.00, 180, 'SCHEDULED'),
(15, 'AI631', 'Mumbai', 'Bangalore', '2026-10-01 17:30:00', '2026-10-01 19:15:00', 4100.00, 180, 'SCHEDULED'),
(16, 'SG711', 'Mumbai', 'Hyderabad', '2026-10-01 11:00:00', '2026-10-01 12:25:00', 3500.00, 180, 'SCHEDULED'),
(17, '6E822', 'Mumbai', 'Chennai', '2026-10-01 13:00:00', '2026-10-01 15:00:00', 4300.00, 180, 'SCHEDULED'),
(18, 'AI105', 'Delhi', 'Mumbai', '2026-10-01 08:00:00', '2026-10-01 10:15:00', 5200.00, 200, 'SCHEDULED'),
(19, '6E215', 'Delhi', 'Mumbai', '2026-10-01 17:00:00', '2026-10-01 19:15:00', 4700.00, 180, 'SCHEDULED'),
(20, 'UK835', 'Delhi', 'Bangalore', '2026-10-01 07:00:00', '2026-10-01 09:45:00', 5600.00, 160, 'SCHEDULED'),
(21, '6E552', 'Bangalore', 'Mumbai', '2026-10-01 12:30:00', '2026-10-01 14:15:00', 3800.00, 180, 'SCHEDULED'),
(22, 'QP108', 'Bangalore', 'Delhi', '2026-10-01 16:00:00', '2026-10-01 18:45:00', 5300.00, 180, 'SCHEDULED'),
(23, '6E901', 'Hyderabad', 'Delhi', '2026-10-01 10:15:00', '2026-10-01 12:30:00', 4500.00, 180, 'SCHEDULED'),
(24, 'SG402', 'Delhi', 'Goa', '2026-10-01 11:00:00', '2026-10-01 13:30:00', 6100.00, 180, 'SCHEDULED'),
(25, '6E341', 'Mumbai', 'Goa', '2026-10-01 15:30:00', '2026-10-01 16:45:00', 3200.00, 180, 'SCHEDULED');

-- Sample Initial Passenger
INSERT INTO passengers (passenger_id, name, age, gender, passport_no) VALUES
(1, 'Rahul Sharma', 24, 'Male', 'IN8910452');

-- Sample Initial Booking
INSERT INTO bookings (booking_id, user_id, passenger_id, flight_id, seat_no, booking_date) VALUES
(1, 1, 1, 1, '12A', '2026-09-25 10:30:00');

-- Sample Seat Record
INSERT INTO seats (flight_id, seat_number, seat_class, status) VALUES
(1, '12A', 'Economy', 'BOOKED');

-- Sample Payment Record
INSERT INTO payments (booking_id, transaction_id, amount, payment_method, payment_status) VALUES
(1, 'TXN-982104921', 5500.00, 'Credit Card', 'SUCCESS');

-- Sample Notification
INSERT INTO notifications (user_id, booking_id, message, notification_type) VALUES
(1, 1, 'Booking Confirmed! Flight AI101 from Pune to Delhi. Seat: 12A', 'BOOKING_CONFIRMED');

-- ==========================================================
-- 6. VIVA SQL QUERIES DEMONSTRATION
-- ==========================================================

-- Q1. INNER JOIN across 4 tables to fetch user ticket details:
-- SELECT b.booking_id, u.name AS user, p.name AS passenger, f.flight_number, b.seat_no, pm.amount
-- FROM bookings b
-- INNER JOIN users u ON b.user_id = u.user_id
-- INNER JOIN passengers p ON b.passenger_id = p.passenger_id
-- INNER JOIN flights f ON b.flight_id = f.flight_id
-- LEFT JOIN payments pm ON b.booking_id = pm.booking_id;

-- Q2. AGGREGATE FUNCTIONS with GROUP BY & HAVING:
-- SELECT f.source, f.destination, COUNT(b.booking_id) AS total_bookings, AVG(f.price) AS avg_fare
-- FROM flights f
-- LEFT JOIN bookings b ON f.flight_id = b.flight_id
-- GROUP BY f.source, f.destination
-- HAVING total_bookings > 0
-- ORDER BY total_bookings DESC;

-- Q3. SUBQUERY: Find flights with price below average domestic fare:
-- SELECT flight_number, source, destination, price
-- FROM flights
-- WHERE price < (SELECT AVG(price) FROM flights);

-- Q4. TRANSACTION WITH ROLLBACK EXAMPLE:
-- START TRANSACTION;
-- UPDATE seats SET status = 'BOOKED' WHERE flight_id = 1 AND seat_number = '14B';
-- INSERT INTO bookings (user_id, passenger_id, flight_id, seat_no) VALUES (1, 1, 1, '14B');
-- -- IF ERROR: ROLLBACK;
-- COMMIT;
