import pg from 'pg';
const { Pool } = pg;

export interface DatabaseWrapper {
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
  run: (sql: string, params?: any[]) => Promise<{ lastID: any; changes: number }>;
  query: (sql: string, params?: any[]) => Promise<pg.QueryResult>;
}

let dbWrapper: DatabaseWrapper | null = null;

export async function getDb(): Promise<DatabaseWrapper> {
  if (dbWrapper) return dbWrapper;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: true
  });

  // Initialize Schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'driver', 'admin')),
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS buses (
      bus_id SERIAL PRIMARY KEY,
      bus_number TEXT UNIQUE NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 40,
      model TEXT,
      plate_number TEXT UNIQUE NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS routes (
      route_id SERIAL PRIMARY KEY,
      route_name TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      total_km NUMERIC(6,2),
      is_active BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS stops (
      stop_id SERIAL PRIMARY KEY,
      route_id INTEGER REFERENCES routes(route_id) ON DELETE CASCADE,
      stop_name TEXT NOT NULL,
      latitude NUMERIC(10,7) NOT NULL,
      longitude NUMERIC(10,7) NOT NULL,
      sequence INTEGER NOT NULL,
      UNIQUE (route_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS drivers (
      driver_id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      license_no TEXT UNIQUE NOT NULL,
      is_active BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS bus_assignments (
      assignment_id SERIAL PRIMARY KEY,
      bus_id INTEGER REFERENCES buses(bus_id),
      driver_id INTEGER REFERENCES drivers(driver_id),
      route_id INTEGER REFERENCES routes(route_id),
      assigned_date DATE NOT NULL,
      shift_start TIME NOT NULL,
      shift_end TIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gps_logs (
      log_id BIGSERIAL PRIMARY KEY,
      bus_id INTEGER REFERENCES buses(bus_id),
      latitude NUMERIC(10,7) NOT NULL,
      longitude NUMERIC(10,7) NOT NULL,
      speed_kmh NUMERIC(5,2),
      heading NUMERIC(5,2),
      timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_gps_logs_bus_time ON gps_logs(bus_id, timestamp DESC);
  `);

  // Seed data if empty
  const userCountRes = await pool.query('SELECT COUNT(*) as count FROM users');
  if (parseInt(userCountRes.rows[0].count) === 0) {
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Admin
    await pool.query('INSERT INTO users (email, password, role, name) VALUES ($1, $2, $3, $4)', 
      ['admin@vitap.ac.in', hashedPassword, 'admin', 'Admin User']);
    
    // Driver
    const driverUserRes = await pool.query('INSERT INTO users (email, password, role, name) VALUES ($1, $2, $3, $4) RETURNING id', 
      ['driver1@vitap.ac.in', hashedPassword, 'driver', 'John Driver']);
    await pool.query('INSERT INTO drivers (user_id, license_no) VALUES ($1, $2)', [driverUserRes.rows[0].id, 'DL123456789']);

    // Student
    await pool.query('INSERT INTO users (email, password, role, name) VALUES ($1, $2, $3, $4)', 
      ['student@vitap.ac.in', hashedPassword, 'student', 'Arjun Student']);

    // Route & Bus
    const routeRes = await pool.query('INSERT INTO routes (route_name, origin, destination, total_km) VALUES ($1, $2, $3, $4) RETURNING route_id', 
      ['Vijayawada to VIT-AP', 'Vijayawada', 'VIT-AP Campus', 30.5]);
    const busRes = await pool.query('INSERT INTO buses (bus_number, plate_number, model) VALUES ($1, $2, $3) RETURNING bus_id', 
      ['BUS-001', 'AP-07-BT-1234', 'Tata Starbus']);
    
    // Assignment
    await pool.query('INSERT INTO bus_assignments (bus_id, driver_id, route_id, assigned_date, shift_start, shift_end) VALUES ($1, $2, $3, $4, $5, $6)', 
      [busRes.rows[0].bus_id, 1, routeRes.rows[0].route_id, '2026-04-09', '07:00:00', '18:00:00']);

    // Stops
    await pool.query('INSERT INTO stops (route_id, stop_name, latitude, longitude, sequence) VALUES ($1, $2, $3, $4, $5)', 
      [routeRes.rows[0].route_id, 'Benz Circle', 16.5062, 80.6480, 1]);
    await pool.query('INSERT INTO stops (route_id, stop_name, latitude, longitude, sequence) VALUES ($1, $2, $3, $4, $5)', 
      [routeRes.rows[0].route_id, 'VIT-AP Campus', 16.5193, 80.5050, 2]);
  }

  // Wrapper to maintain compatibility with server.ts logic
  dbWrapper = {
    get: async (sql: string, params: any[] = []) => {
      const res = await pool.query(sql, params);
      return res.rows[0];
    },
    all: async (sql: string, params: any[] = []) => {
      const res = await pool.query(sql, params);
      return res.rows;
    },
    run: async (sql: string, params: any[] = []) => {
      const res = await pool.query(sql, params);
      return { lastID: (res as any).lastID, changes: res.rowCount || 0 };
    },
    query: (sql: string, params: any[] = []) => pool.query(sql, params)
  };

  return dbWrapper;
}
