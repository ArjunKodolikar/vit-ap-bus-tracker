import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { getDb } from './src/lib/db.js';
import { calculateETA } from './src/lib/eta.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const PORT = Number(process.env.PORT) || 3000;

// In-memory "Redis" for live GPS
const liveGpsCache = new Map<string, any>();

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  // --- Socket.IO ---
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  app.use(express.json());

  // Trust the first proxy (for Railway deployment)
  app.set('trust proxy', 1);

  // --- CORS Configuration ---
  const FRONTEND_URL = process.env.FRONTEND_URL || '*';
  app.use(cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
  }));

  // --- Rate Limiters ---
  const gpsLimiter = rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 5, // limit each IP to 5 requests per windowMs
    message: { error: 'Too many location updates, slow down' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const db = await getDb();

  // --- Middleware ---
  const authenticate = (roles: string[] = []) => {
    return (req: any, res: any, next: any) => {
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (roles.length && !roles.includes(decoded.role)) {
          return res.status(403).json({ error: 'Forbidden: insufficient role' });
        }
        req.user = decoded;
        next();
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    };
  };

  // --- API Routes ---

  // Auth
  app.post('/api/v1/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
    try {
      const user = await db.get('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '1h' });
      res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GPS Update (Driver)
  app.post(
    '/api/v1/bus/location', 
    authenticate(['driver', 'admin']), 
    gpsLimiter,
    [
      body('bus_id').isInt(),
      body('latitude').isFloat({ min: -90, max: 90 }),
      body('longitude').isFloat({ min: -180, max: 180 }),
      body('speed').optional().isFloat({ min: 0 }),
      body('heading').optional().isFloat({ min: 0, max: 360 })
    ],
    async (req: any, res: any) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid coordinates', details: errors.array() });
      }

      const { bus_id, latitude, longitude, speed, heading } = req.body;
      
      const payload = {
        bus_id,
        latitude: parseFloat(latitude).toFixed(7),
        longitude: parseFloat(longitude).toFixed(7),
        speed: parseFloat(speed || 0).toFixed(2),
        heading: parseFloat(heading || 0).toFixed(2),
        updated_at: Math.floor(Date.now() / 1000)
      };

      // 1. Write to "Redis" cache
      liveGpsCache.set(`bus:live:${bus_id}`, payload);

      // 2. Persist to SQL log (async audit trail)
      db.run(
        'INSERT INTO gps_logs (bus_id, latitude, longitude, speed_kmh, heading) VALUES ($1, $2, $3, $4, $5)',
        [bus_id, payload.latitude, payload.longitude, payload.speed, payload.heading]
      ).catch((err: any) => console.error('Audit log error:', err));

      // 3. Broadcast via Socket.IO
      const assignment = await db.get('SELECT route_id FROM bus_assignments WHERE bus_id = $1', [bus_id]);
      if (assignment) {
        io.to(`route:${assignment.route_id}`).emit('bus:location', payload);
      }

      res.json({ success: true });
    }
  );

  // Get Live Location (Student/Admin)
  app.get('/api/v1/bus/:bus_id/location', authenticate(['student', 'admin', 'driver']), async (req, res) => {
    const { bus_id } = req.params;
    const data = liveGpsCache.get(`bus:live:${bus_id}`);
    
    if (!data) {
      return res.status(404).json({ error: 'Bus location unavailable' });
    }

    const staleness = Date.now() / 1000 - data.updated_at;
    res.json({
      ...data,
      stale: staleness > 30
    });
  });

  // Get Routes
  app.get('/api/v1/routes', authenticate(), async (req, res) => {
    const routes = await db.all('SELECT * FROM routes WHERE is_active = TRUE');
    res.json(routes);
  });

  app.get('/api/v1/drivers/active', authenticate(['admin']), async (req, res) => {
    try {
      const drivers = await db.all(`
        SELECT d.driver_id AS id, u.email, d.name, d.phone, d.license_no
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        WHERE d.is_active = TRUE AND u.role = 'driver'
      `);
      res.json(drivers);
    } catch (err) {
      console.error('Error fetching active drivers:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/v1/buses/active', authenticate(['admin']), async (req, res) => {
    try {
      const buses = await db.all('SELECT bus_id AS id, bus_number, plate_number FROM buses WHERE is_active = TRUE');
      res.json(buses);
    } catch (err) {
      console.error('Error fetching active buses:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post(
    '/api/v1/assignments',
    authenticate(['admin']),
    [
      body('bus_id').isInt(),
      body('driver_id').isInt(),
      body('route_id').isInt(),
      body('assigned_date').isISO8601(),
      body('shift_start').matches(/^\d{2}:\d{2}$/),
      body('shift_end').matches(/^\d{2}:\d{2}$/),
    ],
    async (req: any, res: any) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid assignment payload', details: errors.array() });
      }

      const { bus_id, driver_id, route_id, assigned_date, shift_start, shift_end } = req.body;

      try {
        const existingBusAssignment = await db.get(
          'SELECT 1 FROM bus_assignments WHERE bus_id = $1 AND assigned_date = $2',
          [bus_id, assigned_date]
        );
        if (existingBusAssignment) {
          return res.status(400).json({ error: 'This bus is already assigned for this date.' });
        }

        const existingDriverAssignment = await db.get(
          'SELECT 1 FROM bus_assignments WHERE driver_id = $1 AND assigned_date = $2',
          [driver_id, assigned_date]
        );
        if (existingDriverAssignment) {
          return res.status(400).json({ error: 'This driver is already assigned for this date.' });
        }

        await db.run(
          'INSERT INTO bus_assignments (bus_id, driver_id, route_id, assigned_date, shift_start, shift_end) VALUES ($1, $2, $3, $4, $5, $6)',
          [bus_id, driver_id, route_id, assigned_date, shift_start, shift_end]
        );

        res.json({ success: true });
      } catch (err) {
        console.error('Error creating assignment:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // Get Stops for a Route
  app.get('/api/v1/routes/:route_id/stops', authenticate(), async (req, res) => {
    const stops = await db.all('SELECT * FROM stops WHERE route_id = $1 ORDER BY sequence', [req.params.route_id]);
    res.json(stops);
  });

  // Get Buses for a Route
  app.get('/api/v1/routes/:route_id/buses', authenticate(), async (req, res) => {
    try {
      const buses = await db.all(`
        SELECT b.* FROM buses b
        JOIN bus_assignments ba ON b.bus_id = ba.bus_id
        WHERE ba.route_id = $1 AND b.is_active = TRUE
        AND ba.assigned_date = CURRENT_DATE AND CURRENT_TIME BETWEEN ba.shift_start AND ba.shift_end
      `, [req.params.route_id]);
      res.json(buses);
    } catch (err) {
      console.error('Error fetching buses for route:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get ETA for a Bus to a specific Stop (SRS 3.3 / 7.3)
  app.get('/api/v1/bus/:bus_id/eta/:stop_id', authenticate(), async (req, res) => {
    const { bus_id, stop_id } = req.params;
    
    const busData = liveGpsCache.get(`bus:live:${bus_id}`);
    if (!busData) {
      return res.status(404).json({ error: 'Bus location unavailable' });
    }

    const stop = await db.get('SELECT * FROM stops WHERE stop_id = $1', [stop_id]);
    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    const etaResult = calculateETA(
      parseFloat(busData.latitude),
      parseFloat(busData.longitude),
      parseFloat(stop.latitude),
      parseFloat(stop.longitude),
      parseFloat(busData.speed)
    );

    res.json({
      bus_id: parseInt(bus_id),
      stop_id: parseInt(stop_id),
      ...etaResult
    });
  });

  app.get('/api/v1/drivers/me/assignment', authenticate(['driver']), async (req: any, res: any) => {
    try {
      const driver = await db.get('SELECT driver_id FROM drivers WHERE user_id = $1', [req.user.id]);
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      const assignment = await db.get(`
        SELECT ba.*, b.bus_number, r.route_name
        FROM bus_assignments ba
        JOIN buses b ON ba.bus_id = b.bus_id
        JOIN routes r ON ba.route_id = r.route_id
        WHERE ba.driver_id = $1 AND ba.assigned_date = CURRENT_DATE
        AND CURRENT_TIME BETWEEN ba.shift_start AND ba.shift_end
      `, [driver.driver_id]);

      if (!assignment) {
        // Check for next shift today
        const nextShift = await db.get(`
          SELECT shift_start FROM bus_assignments
          WHERE driver_id = $1 AND assigned_date = CURRENT_DATE AND shift_start > CURRENT_TIME
          ORDER BY shift_start LIMIT 1
        `, [driver.driver_id]);
        return res.json({ active: false, nextShift: nextShift ? nextShift.shift_start : null });
      }

      res.json({ active: true, ...assignment });
    } catch (err) {
      console.error('Error fetching driver assignment:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Admin User Management APIs ---
  app.get('/api/v1/admin/users', authenticate(['admin']), async (req: any, res: any) => {
    const { role } = req.query;
    if (!['student', 'driver'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be student or driver.' });
    }
    try {
      if (role === 'student') {
        const users = await db.all('SELECT id, email, name FROM users WHERE role = $1', [role]);
        res.json(users);
      } else if (role === 'driver') {
        const drivers = await db.all(`
          SELECT d.driver_id AS id, u.email, d.name, d.phone, d.license_no, d.is_active
          FROM drivers d
          JOIN users u ON d.user_id = u.id
          WHERE u.role = 'driver'
        `);
        res.json(drivers);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/v1/admin/users', authenticate(['admin']), async (req: any, res: any) => {
    const { email, password, role, name, phone, license_no, is_active } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
    if (!['student', 'driver', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be student, driver or admin.' });
    }
    if (role === 'driver' && !license_no) {
      return res.status(400).json({ error: 'License number required for drivers.' });
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const userRes = await db.run('INSERT INTO users (email, password, role, name) VALUES ($1, $2, $3, $4) RETURNING id', 
        [normalizedEmail, hashedPassword, role, name]);
      if (role === 'driver') {
        await db.run('INSERT INTO drivers (user_id, name, phone, license_no, is_active) VALUES ($1, $2, $3, $4, $5)', 
          [userRes.lastID, name, phone, license_no, is_active !== false]);
      }
      res.json({ success: true, userId: userRes.lastID });
    } catch (err) {
      console.error('Error adding user:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/v1/admin/users/:id', authenticate(['admin']), async (req: any, res: any) => {
    const { id } = req.params;
    const { email, password, role, name, phone, license_no, is_active } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
    try {
      if (role === 'student') {
        let query = 'UPDATE users SET email = $1, name = $2 WHERE id = $3';
        let params = [normalizedEmail, name, id];
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          query = 'UPDATE users SET email = $1, password = $2, name = $3 WHERE id = $4';
          params = [normalizedEmail, hashedPassword, name, id];
        }
        await db.run(query, params);
      } else if (role === 'driver') {
        // Update users table for email and name
        let userQuery = 'UPDATE users SET email = $1, name = $2 WHERE id = (SELECT user_id FROM drivers WHERE driver_id = $3)';
        let userParams = [normalizedEmail, name, id];
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          userQuery = 'UPDATE users SET email = $1, password = $2, name = $3 WHERE id = (SELECT user_id FROM drivers WHERE driver_id = $4)';
          userParams = [normalizedEmail, hashedPassword, name, id];
        }
        await db.run(userQuery, userParams);
        // Update drivers table
        await db.run('UPDATE drivers SET name = $1, phone = $2, license_no = $3, is_active = $4 WHERE driver_id = $5', 
          [name, phone, license_no, is_active !== false, id]);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating user:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/v1/admin/users/:id', authenticate(['admin']), async (req: any, res: any) => {
    const { id } = req.params;
    const { role } = req.body; // Pass role in body for context
    try {
      if (role === 'student') {
        await db.run('DELETE FROM users WHERE id = $1', [id]);
      } else if (role === 'driver') {
        const driver = await db.get('SELECT user_id FROM drivers WHERE driver_id = $1', [id]);
        await db.run('DELETE FROM drivers WHERE driver_id = $1', [id]);
        await db.run('DELETE FROM users WHERE id = $1', [driver.user_id]);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Admin Stop Management APIs ---
  app.get('/api/v1/admin/stops', authenticate(['admin']), async (req: any, res: any) => {
    const { route_id } = req.query;
    if (!route_id) {
      return res.status(400).json({ error: 'route_id query parameter is required' });
    }
    try {
      const stops = await db.all('SELECT * FROM stops WHERE route_id = $1 ORDER BY sequence', [route_id]);
      res.json(stops);
    } catch (err) {
      console.error('Error fetching stops:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/v1/admin/stops', authenticate(['admin']), [
    body('route_id').isInt(),
    body('stop_name').isString().notEmpty(),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('sequence').isInt({ min: 1 })
  ], async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid stop data', details: errors.array() });
    }

    const { route_id, stop_name, latitude, longitude, sequence } = req.body;

    try {
      // Check for duplicate sequence in the route
      const existing = await db.get('SELECT 1 FROM stops WHERE route_id = $1 AND sequence = $2', [route_id, sequence]);
      if (existing) {
        return res.status(400).json({ error: 'A stop with this sequence already exists for the route' });
      }

      await db.run(
        'INSERT INTO stops (route_id, stop_name, latitude, longitude, sequence) VALUES ($1, $2, $3, $4, $5)',
        [route_id, stop_name, latitude, longitude, sequence]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Error adding stop:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/v1/admin/stops/:stop_id', authenticate(['admin']), [
    body('route_id').isInt(),
    body('stop_name').isString().notEmpty(),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('sequence').isInt({ min: 1 })
  ], async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid stop data', details: errors.array() });
    }

    const { stop_id } = req.params;
    const { route_id, stop_name, latitude, longitude, sequence } = req.body;

    try {
      // Check for duplicate sequence (excluding current stop)
      const existing = await db.get('SELECT 1 FROM stops WHERE route_id = $1 AND sequence = $2 AND stop_id != $3', [route_id, sequence, stop_id]);
      if (existing) {
        return res.status(400).json({ error: 'A stop with this sequence already exists for the route' });
      }

      await db.run(
        'UPDATE stops SET route_id = $1, stop_name = $2, latitude = $3, longitude = $4, sequence = $5 WHERE stop_id = $6',
        [route_id, stop_name, latitude, longitude, sequence, stop_id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating stop:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/v1/admin/stops/:stop_id', authenticate(['admin']), async (req: any, res: any) => {
    const { stop_id } = req.params;
    try {
      await db.run('DELETE FROM stops WHERE stop_id = $1', [stop_id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting stop:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH endpoint for driver to update current stop sequence
  app.patch('/api/v1/assignments/me/stop', authenticate(['driver']), async (req: any, res: any) => {
    const { current_stop_sequence } = req.body;
    if (typeof current_stop_sequence !== 'number' || current_stop_sequence < 0) {
      return res.status(400).json({ error: 'Invalid current_stop_sequence' });
    }

    try {
      const driver = await db.get('SELECT driver_id FROM drivers WHERE user_id = $1', [req.user.id]);
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      const assignment = await db.get(`
        SELECT assignment_id FROM bus_assignments
        WHERE driver_id = $1 AND assigned_date = CURRENT_DATE
        AND CURRENT_TIME BETWEEN shift_start AND shift_end
      `, [driver.driver_id]);

      if (!assignment) {
        return res.status(404).json({ error: 'No active assignment found' });
      }

      await db.run('UPDATE bus_assignments SET current_stop_sequence = $1 WHERE assignment_id = $2', [current_stop_sequence, assignment.assignment_id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating stop sequence:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get Active Bus Assignments (Admin)
  app.get('/api/v1/assignments/active', authenticate(['admin']), async (req, res) => {
    try {
      const date = req.query.date ? req.query.date.toString() : null;
      const assignments = await db.all(`
        SELECT 
          ba.assignment_id,
          b.bus_number,
          b.plate_number,
          b.capacity,
          d.name AS driver_name,
          d.phone,
          r.route_name,
          r.origin,
          r.destination,
          ba.shift_start,
          ba.shift_end
        FROM bus_assignments ba
        JOIN buses b ON ba.bus_id = b.bus_id
        JOIN drivers d ON ba.driver_id = d.driver_id
        JOIN routes r ON ba.route_id = r.route_id
        WHERE ba.assigned_date = COALESCE($1::date, localtimestamp::date)
          AND b.is_active = TRUE 
          AND d.is_active = TRUE 
          AND r.is_active = TRUE
      `, [date]);
      res.json(assignments);
    } catch (err) {
      console.error('Error fetching active assignments:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Socket.IO Middleware ---
  io.use((socket: any, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  // --- Socket.IO Events ---
  io.on('connection', (socket: any) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.user?.email})`);

    socket.on('subscribe:route', ({ route_id }: { route_id: number }) => {
      socket.join(`route:${route_id}`);
      console.log(`Socket ${socket.id} joined route:${route_id}`);
    });

    socket.on('unsubscribe:route', ({ route_id }: { route_id: number }) => {
      socket.leave(`route:${route_id}`);
      console.log(`Socket ${socket.id} left route:${route_id}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  // --- Vite Integration (Optional in Production) ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Only serve static files if dist exists (optional for decoupled backend)
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      // If it's an API route, don't serve index.html
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
          // If index.html doesn't exist (e.g. backend-only deploy), just 404
          res.status(404).send('Not Found');
        }
      });
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
