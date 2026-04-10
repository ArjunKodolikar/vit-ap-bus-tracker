# VIT-AP Bus Tracker

[![React](https://img.shields.io/badge/React-19.0.0-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-3C873A?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-316192?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.1.14-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Overview

VIT-AP Bus Tracker is a full-stack college transit system for real-time bus location monitoring, route progress, and role-based dashboards. It combines live GPS tracking, ETA estimation, and administrative fleet assignment controls in a unified web application.

Students can follow active buses on an interactive map and inspect route progress. Drivers can broadcast location updates, manage their active assignment, and update stop progress. Admins can manage routes, buses, stops, users, and assignments while preventing schedule conflicts and keeping the system deployment-ready.

## Key Features

### Admin
- Manage active fleet assignments and driver schedules.
- Create, update, and delete route stops with stop sequence validation.
- Prevent double-booking of buses or drivers for the same date.
- Designed for modern deployment workflows with Vite + Express and environment-based hosting settings.

### Driver
- Broadcast live bus location updates to the backend over authenticated API calls.
- Enforce shift-time availability for driver assignments in the backend.
- Support progress tracking via current stop sequence updates for active assignments.

### Student
- View live map-based bus tracking and current route movement.
- Track active bus location with automatic polling and real-time route progress.
- Use the route and assignment data model to follow scheduled stops and ETA behavior.

## Tech Stack

- Frontend
  - React 19
  - Vite
  - Tailwind CSS
  - React Leaflet
  - Socket.IO client
- Backend
  - Node.js / Express
  - Socket.IO
  - JSON Web Tokens (JWT)
  - bcryptjs
  - express-validator
- Database
  - PostgreSQL
  - `pg` client
- Hosting / Deployment
  - Railway / Vercel friendly architecture
  - Environment-driven CORS and API routing

## Database Schema

The core database objects are defined in `src/lib/db.ts` and include:

- `users`
  - Stores authentication accounts for `student`, `driver`, and `admin` roles.
- `buses`
  - Stores bus fleet details like bus number, plate number, model, capacity, and active state.
- `routes`
  - Stores route metadata including origin, destination, total kilometers, and active status.
- `stops`
  - Stores ordered route stops with latitude, longitude, stop name, and sequence position.
- `drivers`
  - Stores driver profile details linked to a `users` account.
- `bus_assignments`
  - Stores bus + driver + route assignments by date and shift window, with a route progress sequence.
- `gps_logs`
  - Stores an audit trail of location updates for historical tracking.

Relationships:
- `drivers.user_id` → `users.id`
- `stops.route_id` → `routes.route_id`
- `bus_assignments.bus_id` → `buses.bus_id`
- `bus_assignments.driver_id` → `drivers.driver_id`
- `bus_assignments.route_id` → `routes.route_id`

## Getting Started / Installation

```bash
git clone https://github.com/ArjunKodolikar/vit-ap-bus-tracker.git
cd vit-ap-bus-tracker
npm install
npm run dev
```

Then open the server URL shown in the terminal, typically:

```bash
http://localhost:3000
```

If you want to build for production:

```bash
npm run build
npm start
```

For a frontend-only production bundle build:

```bash
npm run build:frontend
```

## Environment Variables

Create a `.env` file in the project root with these values:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
JWT_SECRET="super-secret-key-change-me-in-production"
VITE_API_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"
PORT="3000"
```

- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_SECRET` — secret used to sign authentication tokens.
- `VITE_API_URL` — API base URL consumed by the frontend.
- `FRONTEND_URL` — allowed frontend origin for CORS and Socket.IO.
- `PORT` — optional server port override.

## Notes

- The backend server uses `tsx server.ts` in development and integrates Vite middleware for the frontend.
- Live bus tracking is handled through authenticated Socket.IO subscriptions and location update endpoints.
- The application seeds sample admin, driver, student, route, bus, and stop data on first startup if the database is empty.
