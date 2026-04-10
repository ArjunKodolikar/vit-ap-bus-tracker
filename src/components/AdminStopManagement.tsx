import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/v1';

interface Route {
  route_id: number;
  route_name: string;
  origin: string;
  destination: string;
}

interface Stop {
  stop_id: number;
  route_id: number;
  stop_name: string;
  latitude: number;
  longitude: number;
  sequence: number;
}

export default function AdminStopManagement({ token }: { token: string }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | ''>('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<Stop | null>(null);
  const [formData, setFormData] = useState({
    stop_name: '',
    latitude: '',
    longitude: '',
    sequence: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRoutes();
  }, [token]);

  useEffect(() => {
    if (selectedRouteId) {
      fetchStops();
    } else {
      setStops([]);
    }
  }, [selectedRouteId, token]);

  const fetchRoutes = async () => {
    try {
      const res = await fetch(`${API_BASE}/routes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setRoutes(data);
    } catch (err) {
      setError('Failed to fetch routes');
    }
  };

  const fetchStops = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/stops?route_id=${selectedRouteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStops(data);
    } catch (err) {
      setError('Failed to fetch stops');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const method = editingStop ? 'PUT' : 'POST';
    const url = editingStop ? `${API_BASE}/admin/stops/${editingStop.stop_id}` : `${API_BASE}/admin/stops`;
    const body = {
      ...formData,
      route_id: Number(selectedRouteId),
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude),
      sequence: parseInt(formData.sequence)
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save stop');
      }
      fetchStops();
      setIsModalOpen(false);
      setEditingStop(null);
      setFormData({ stop_name: '', latitude: '', longitude: '', sequence: '' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (stop: Stop) => {
    setEditingStop(stop);
    setFormData({
      stop_name: stop.stop_name,
      latitude: stop.latitude.toString(),
      longitude: stop.longitude.toString(),
      sequence: stop.sequence.toString()
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (stopId: number) => {
    if (!confirm('Are you sure you want to delete this stop?')) return;
    try {
      await fetch(`${API_BASE}/admin/stops/${stopId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchStops();
    } catch (err) {
      setError('Failed to delete stop');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Stop Management</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={!selectedRouteId}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:bg-slate-300"
        >
          <Plus size={16} />
          Add Stop
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Select Route</label>
        <select
          value={selectedRouteId}
          onChange={(e) => setSelectedRouteId(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="">Select a route</option>
          {routes.map(route => (
            <option key={route.route_id} value={route.route_id}>
              {route.route_name} ({route.origin} → {route.destination})
            </option>
          ))}
        </select>
      </div>

      {error && <div className="text-red-600">{error}</div>}

      {selectedRouteId && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Latitude</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Longitude</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Sequence</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stops.map(stop => (
                <tr key={stop.stop_id} className="border-t">
                  <td className="px-4 py-3 text-sm">{stop.stop_name}</td>
                  <td className="px-4 py-3 text-sm">{stop.latitude}</td>
                  <td className="px-4 py-3 text-sm">{stop.longitude}</td>
                  <td className="px-4 py-3 text-sm">{stop.sequence}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => handleEdit(stop)} className="text-blue-600 hover:text-blue-800">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => handleDelete(stop.stop_id)} className="text-red-600 hover:text-red-800">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white p-6 rounded-lg w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-4">{editingStop ? 'Edit' : 'Add'} Stop</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  placeholder="Stop Name"
                  value={formData.stop_name}
                  onChange={e => setFormData({ ...formData, stop_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={formData.latitude}
                  onChange={e => setFormData({ ...formData, latitude: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={formData.longitude}
                  onChange={e => setFormData({ ...formData, longitude: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                <input
                  type="number"
                  placeholder="Sequence"
                  value={formData.sequence}
                  onChange={e => setFormData({ ...formData, sequence: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    {loading ? 'Saving...' : editingStop ? 'Update' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-300 px-4 py-2 rounded">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}