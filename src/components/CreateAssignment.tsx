import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/v1';

interface Driver {
  id: number;
  name: string;
  email: string;
  phone?: string;
  license_no?: string;
}

interface Bus {
  id: number;
  bus_number: string;
  plate_number?: string;
}

interface Route {
  route_id: number;
  route_name: string;
  origin: string;
  destination: string;
}

interface CreateAssignmentProps {
  token: string | null;
  onClose: () => void;
  onCreated: () => void;
}

const getTodayDate = () => new Date().toISOString().slice(0, 10);

export default function CreateAssignment({ token, onClose, onCreated }: CreateAssignmentProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [driverId, setDriverId] = useState<number | ''>('');
  const [busId, setBusId] = useState<number | ''>('');
  const [routeId, setRouteId] = useState<number | ''>('');
  const [assignedDate, setAssignedDate] = useState(getTodayDate());
  const [shiftStart, setShiftStart] = useState('07:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;

    const fetchLists = async () => {
      try {
        const [driversRes, busesRes, routesRes] = await Promise.all([
          fetch(`${API_BASE}/drivers/active`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/buses/active`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/routes`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (!driversRes.ok || !busesRes.ok || !routesRes.ok) {
          throw new Error('Unable to load assignment options');
        }

        setDrivers(await driversRes.json());
        setBuses(await busesRes.json());
        setRoutes(await routesRes.json());
      } catch (err) {
        setError((err as Error).message || 'Unable to load assignment data');
      }
    };

    fetchLists();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bus_id: Number(busId),
          driver_id: Number(driverId),
          route_id: Number(routeId),
          assigned_date: assignedDate,
          shift_start: shiftStart,
          shift_end: shiftEnd,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body?.error || 'Unable to create assignment');
        setLoading(false);
        return;
      }

      onCreated();
    } catch (err) {
      setError('Connection error');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:bg-slate-100"
        >
          <X size={20} />
        </button>

        <h3 className="text-xl font-bold text-slate-900 mb-4">Create Assignment</h3>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Driver</label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              required
            >
              <option value="">Select a driver</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} ({driver.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Bus</label>
            <select
              value={busId}
              onChange={(e) => setBusId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              required
            >
              <option value="">Select a bus</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {bus.bus_number} {bus.plate_number ? `(${bus.plate_number})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Route</label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              required
            >
              <option value="">Select a route</option>
              {routes.map((route) => (
                <option key={route.route_id} value={route.route_id}>
                  {route.route_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
              <input
                type="date"
                value={assignedDate}
                onChange={(e) => setAssignedDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Shift Start</label>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Shift End</label>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Create Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
