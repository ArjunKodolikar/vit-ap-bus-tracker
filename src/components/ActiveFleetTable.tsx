import React, { useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/v1';

export interface ActiveAssignment {
  assignment_id: number;
  bus_number: string;
  plate_number?: string;
  capacity: number;
  driver_name: string;
  phone: string;
  route_name: string;
  origin: string;
  destination: string;
  shift_start: string;
  shift_end: string;
}

export default function ActiveFleetTable({ token, refreshKey }: { token: string | null; refreshKey?: number }) {
  const [assignments, setAssignments] = useState<ActiveAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Authentication token is missing. Please sign in again.');
      setLoading(false);
      return;
    }

    const localDate = new Date().toISOString().slice(0, 10);
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/assignments/active?date=${localDate}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Request failed with status ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setAssignments(data || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Unable to fetch active assignments.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token, refreshKey]);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 h-full">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-slate-500">Today’s active fleet assignments</p>
          <h2 className="text-2xl font-semibold text-slate-900">Active Fleet</h2>
        </div>
        {loading && <p className="text-sm text-slate-500">Loading assignments…</p>}
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && assignments.length === 0 && (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 px-4 py-6 text-center">
          No active assignments found for today.
        </div>
      )}

      {!loading && !error && assignments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Bus</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Driver</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Route</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Shift</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {assignments.map((assignment) => (
                <tr key={assignment.assignment_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4 align-top">
                    <div className="text-sm font-semibold text-slate-900">{assignment.bus_number}</div>
                    <div className="text-xs text-slate-500">{assignment.plate_number || 'No plate available'}</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="text-sm font-semibold text-slate-900">{assignment.driver_name}</div>
                    <div className="text-xs text-slate-500">{assignment.phone}</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="text-sm font-semibold text-slate-900">{assignment.route_name}</div>
                    <div className="text-xs text-slate-500">{assignment.origin} → {assignment.destination}</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="text-sm font-semibold text-slate-900">{assignment.shift_start}</div>
                    <div className="text-xs text-slate-500">{assignment.shift_end}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
