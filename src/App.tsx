import React, { useState, useEffect } from 'react';
import { LogIn, Bus, MapPin, Navigation, User, LogOut, Shield, Clock, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Map from './components/Map';
import AdminUserManagement from './components/AdminUserManagement';
import ActiveFleetTable from './components/ActiveFleetTable';
import CreateAssignment from './components/CreateAssignment';
import { useBusTracking } from './hooks/useBusTracking';
import { calculateETA } from './lib/eta';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api/v1';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<'login' | 'dashboard'>('login');
  
  // Student State
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const busLocations = useBusTracking(selectedRoute?.route_id || null, token);

  // Driver State
  const [isSharing, setIsSharing] = useState(false);
  const [assignedBus, setAssignedBus] = useState<any>(null);
  const [driverAssignment, setDriverAssignment] = useState<any>(null);

  // Admin State
  const [adminView, setAdminView] = useState<'dashboard' | 'users'>('dashboard');
  const [assignmentRefresh, setAssignmentRefresh] = useState(0);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('bus_token');
    const savedUser = localStorage.getItem('bus_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setView('dashboard');
    }
  }, []);

  useEffect(() => {
    if (token && user?.role === 'student') {
      fetch(`${API_BASE}/routes`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(setRoutes);
    }
    if (token && user?.role === 'driver') {
      const fetchAssignment = async () => {
        try {
          const res = await fetch(`${API_BASE}/drivers/me/assignment`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          setDriverAssignment(data);
          if (data.active) {
            setAssignedBus({ bus_id: data.bus_id, bus_number: data.bus_number });
          } else {
            setAssignedBus(null);
            setIsSharing(false); // Stop sharing if no active shift
          }
        } catch (err) {
          console.error('Error fetching assignment:', err);
        }
      };
      fetchAssignment();
      const interval = setInterval(fetchAssignment, 60000); // Refetch every minute
      return () => clearInterval(interval);
    }
  }, [token, user]);

  useEffect(() => {
    if (selectedRoute && token) {
      fetch(`${API_BASE}/routes/${selectedRoute.route_id}/stops`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(setStops);
    }
  }, [selectedRoute, token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('bus_token', data.token);
        localStorage.setItem('bus_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setView('dashboard');
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      alert('Connection error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('bus_token');
    localStorage.removeItem('bus_user');
    setToken(null);
    setUser(null);
    setView('login');
  };

  // Driver Location Sharing Logic
  useEffect(() => {
    let interval: any;
    if (isSharing && user?.role === 'driver' && assignedBus && driverAssignment?.active) {
      interval = setInterval(() => {
        navigator.geolocation.getCurrentPosition((pos) => {
          fetch(`${API_BASE}/bus/location`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              bus_id: assignedBus.bus_id,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              speed: pos.coords.speed || 30,
              heading: pos.coords.heading || 0
            })
          });
        });
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isSharing, user, assignedBus, token]);

  if (view === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="bg-blue-900 p-4 rounded-2xl mb-4 text-white shadow-lg">
              <Bus size={40} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">VIT-AP Bus Tracker</h1>
            <p className="text-slate-500 text-sm mt-1">Real-time Campus Transport</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input 
                name="email"
                type="email" 
                required 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="email@vitap.ac.in"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input 
                name="password"
                type="password" 
                required 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-blue-900 text-white py-3 rounded-xl font-semibold hover:bg-blue-800 transition-colors shadow-md flex items-center justify-center gap-2"
            >
              <LogIn size={20} />
              Sign In
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              Demo Credentials:<br/>
              Student: student@vitap.ac.in / password123<br/>
              Driver: driver1@vitap.ac.in / password123
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-900 p-2 rounded-lg text-white">
            <Bus size={24} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 leading-tight">VIT-AP Tracker</h2>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Shield size={10} /> {user?.role.toUpperCase()} MODE
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-medium text-slate-900">{user?.name}</span>
            <span className="text-xs text-slate-500">{user?.email}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all rounded-lg"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar / Controls */}
        <aside className="w-full md:w-80 bg-white border-r border-slate-200 p-6 overflow-y-auto z-40 shadow-sm">
          {user?.role === 'student' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Navigation size={16} className="text-blue-600" />
                  Select Route
                </label>
                <div className="space-y-2">
                  {routes.map(route => (
                    <button
                      key={route.route_id}
                      onClick={() => setSelectedRoute(route)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedRoute?.route_id === route.route_id 
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                        : 'border-slate-100 hover:border-slate-300 bg-slate-50'
                      }`}
                    >
                      <p className="font-bold text-slate-900">{route.route_name}</p>
                      <p className="text-xs text-slate-500 mt-1">{route.origin} → {route.destination}</p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedRoute && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Clock size={16} className="text-blue-600" />
                    Live ETAs
                  </h3>
                  <div className="space-y-3">
                    {stops.map(stop => {
                      const bus = Object.values(busLocations)[0] as any; // Simplified for demo
                      let eta = null;
                      if (bus) {
                        eta = calculateETA(bus.latitude, bus.longitude, stop.latitude, stop.longitude, bus.speed);
                      }
                      return (
                        <div key={stop.stop_id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{stop.stop_name}</p>
                            <p className="text-xs text-slate-500">Stop #{stop.sequence}</p>
                          </div>
                          {eta && (
                            <div className="text-right">
                              <p className="text-sm font-bold text-blue-600">{eta.etaMinutes} min</p>
                              <p className="text-[10px] text-slate-400">{eta.distanceKm} km</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {user?.role === 'driver' && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                  <Bus size={20} />
                  Your Assignment
                </h3>
                {driverAssignment?.active ? (
                  <>
                    <p className="text-sm text-blue-700 font-medium">{assignedBus?.bus_number}</p>
                    <p className="text-xs text-blue-600 mt-1">Route: {driverAssignment.route_name}</p>
                  </>
                ) : driverAssignment?.nextShift ? (
                  <p className="text-sm text-blue-700">Your shift starts at {driverAssignment.nextShift}.</p>
                ) : (
                  <p className="text-sm text-blue-700">You have no scheduled shifts for today.</p>
                )}
              </div>

              {driverAssignment?.active && (
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isSharing ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Navigation size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">Share Location</p>
                        <p className="text-xs text-slate-500">{isSharing ? 'Live Tracking ON' : 'Tracking Paused'}</p>
                      </div>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={isSharing} 
                      onChange={(e) => setIsSharing(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  {isSharing && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-green-50 border border-green-100 p-4 rounded-xl flex items-center gap-3"
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <p className="text-xs font-medium text-green-700">Broadcasting live GPS every 5s</p>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          )}

          {user?.role === 'admin' && (
            <div className="space-y-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setAdminView('dashboard')}
                  className={`px-4 py-2 rounded-lg ${adminView === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setAdminView('users')}
                  className={`px-4 py-2 rounded-lg ${adminView === 'users' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}
                >
                  User Management
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <section className="flex-1 relative bg-slate-200 p-6">
          {user?.role === 'admin' ? (
            adminView === 'dashboard' ? (
              <>
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-semibold text-slate-900">Admin Dashboard</h1>
                    <p className="text-sm text-slate-500">View and manage active fleet assignments.</p>
                  </div>
                  <button
                    onClick={() => setIsAssignmentModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
                  >
                    <PlusCircle size={16} />
                    Create Assignment
                  </button>
                </div>

                <ActiveFleetTable token={token} refreshKey={assignmentRefresh} />

                {isAssignmentModalOpen && (
                  <CreateAssignment
                    token={token}
                    onClose={() => setIsAssignmentModalOpen(false)}
                    onCreated={() => {
                      setAssignmentRefresh((prev) => prev + 1);
                      setIsAssignmentModalOpen(false);
                    }}
                  />
                )}
              </>
            ) : (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 h-full">
                <AdminUserManagement token={token} />
              </div>
            )
          ) : (
            <div className="relative h-full">
              <Map 
                center={selectedRoute && stops.length > 0 ? [stops[0].latitude, stops[0].longitude] : [16.5193, 80.5050]} 
                busLocations={busLocations}
                stops={stops}
              />
              
              {!selectedRoute && user?.role === 'student' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] z-10">
                  <div className="bg-white p-6 rounded-2xl shadow-2xl text-center max-w-xs">
                    <MapPin size={48} className="mx-auto text-blue-600 mb-4" />
                    <h3 className="font-bold text-slate-900 mb-2">Select a Route</h3>
                    <p className="text-sm text-slate-500">Choose a route from the sidebar to see live bus locations and ETAs.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
