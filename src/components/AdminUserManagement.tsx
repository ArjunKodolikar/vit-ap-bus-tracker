import React, { useState, useEffect } from 'react';
import { UserPlus, Edit, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/v1';

interface User {
  id: number;
  email: string;
  role: string;
  name: string;
  phone?: string;
  license_no?: string;
  is_active?: boolean;
}

export default function AdminUserManagement({ token }: { token: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [role, setRole] = useState<'student' | 'driver'>('student');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    license_no: '',
    is_active: true
  });

  useEffect(() => {
    fetchUsers();
  }, [role, token]);

  const fetchUsers = async () => {
    const res = await fetch(`${API_BASE}/admin/users?role=${role}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setUsers(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingUser ? 'PUT' : 'POST';
    const url = editingUser ? `${API_BASE}/admin/users/${editingUser.id}` : `${API_BASE}/admin/users`;
    const body = { ...formData, role };
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    fetchUsers();
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData({ email: '', password: '', name: '', phone: '', license_no: '', is_active: true });
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      phone: user.phone || '',
      license_no: user.license_no || '',
      is_active: user.is_active !== false
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this user?')) {
      await fetch(`${API_BASE}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role })
      });
      fetchUsers();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">User Management</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
        >
          <UserPlus size={16} />
          Add {role === 'student' ? 'Student' : 'Driver'}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setRole('student')}
          className={`px-4 py-2 rounded-lg ${role === 'student' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}
        >
          Students
        </button>
        <button
          onClick={() => setRole('driver')}
          className={`px-4 py-2 rounded-lg ${role === 'driver' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}
        >
          Drivers
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden w-full overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Email</th>
              {role === 'driver' && <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Phone</th>}
              {role === 'driver' && <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">License</th>}
              {role === 'driver' && <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Active</th>}
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-t">
                <td className="px-4 py-3 text-sm">{user.name}</td>
                <td className="px-4 py-3 text-sm">{user.email}</td>
                {role === 'driver' && <td className="px-4 py-3 text-sm">{user.phone}</td>}
                {role === 'driver' && <td className="px-4 py-3 text-sm">{user.license_no}</td>}
                {role === 'driver' && <td className="px-4 py-3 text-sm">{user.is_active ? 'Yes' : 'No'}</td>}
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => handleEdit(user)} className="text-blue-600 hover:text-blue-800">
                    <Edit size={16} />
                  </button>
                  <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-800">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
              <h3 className="text-lg font-bold mb-4">{editingUser ? 'Edit' : 'Add'} {role === 'student' ? 'Student' : 'Driver'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  placeholder="Name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                {!editingUser && (
                  <input
                    type="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                )}
                {role === 'driver' && (
                  <>
                    <input
                      type="text"
                      placeholder="Phone"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                    />
                    <input
                      type="text"
                      placeholder="License Number"
                      value={formData.license_no}
                      onChange={e => setFormData({ ...formData, license_no: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                      required
                    />
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                      />
                      Active
                    </label>
                  </>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    {editingUser ? 'Update' : 'Add'}
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