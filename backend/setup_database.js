// Simple SQLite database setup for Bhutan Bus System
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'bhutan_bus_system.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Setting up Bhutan Bus System database...');

// Create tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cid_number TEXT UNIQUE,
    phone_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    is_student BOOLEAN DEFAULT 0,
    preferred_language TEXT DEFAULT 'en',
    balance INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Bus routes
  db.run(`CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_number TEXT UNIQUE NOT NULL,
    route_name TEXT NOT NULL,
    start_point TEXT NOT NULL,
    end_point TEXT NOT NULL,
    distance_km REAL,
    estimated_time_minutes INTEGER,
    base_fare INTEGER DEFAULT 25,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Bus stops
  db.run(`CREATE TABLE IF NOT EXISTS bus_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    address TEXT,
    stop_code TEXT UNIQUE
  )`);

  // Buses
  db.run(`CREATE TABLE IF NOT EXISTS buses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_number TEXT UNIQUE NOT NULL,
    license_plate TEXT UNIQUE NOT NULL,
    route_id INTEGER,
    driver_id INTEGER,
    current_latitude REAL,
    current_longitude REAL,
    status TEXT DEFAULT 'active',
    capacity INTEGER DEFAULT 40,
    current_occupancy INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (route_id) REFERENCES routes(id),
    FOREIGN KEY (driver_id) REFERENCES users(id)
  )`);

  // Sample data for testing
  console.log('Inserting sample data...');

  // Sample routes
  db.run(`INSERT OR IGNORE INTO routes (route_number, route_name, start_point, end_point, base_fare) VALUES
    ('1', 'Memorial Chorten - Clock Tower', 'Memorial Chorten', 'Clock Tower', 25),
    ('2', 'Chubachu - Motithang', 'Chubachu', 'Motithang', 30),
    ('3', 'Thimphu - Paro', 'Thimphu City', 'Paro Town', 150)`);

  // Sample bus stops
  db.run(`INSERT OR IGNORE INTO bus_stops (name, latitude, longitude, stop_code) VALUES
    ('Memorial Chorten', 27.4712, 89.6377, 'MC001'),
    ('Clock Tower', 27.4714, 89.6391, 'CT001'),
    ('Chubachu', 27.4728, 89.6389, 'CB001'),
    ('Motithang', 27.4698, 89.6356, 'MT001')`);

  // Sample bus
  db.run(`INSERT OR IGNORE INTO buses (bus_number, license_plate, route_id, current_latitude, current_longitude, capacity) VALUES
    ('BT-001', 'BT-AA-1234', 1, 27.4713, 89.6384, 40)`);

  console.log('Database setup completed successfully!');
});

db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed.');
  }
});