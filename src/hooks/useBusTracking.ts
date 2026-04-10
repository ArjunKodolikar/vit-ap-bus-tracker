import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface BusLocation {
  bus_id: number;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  updated_at: number;
  stale?: boolean;
}

export interface ActiveAssignment {
  assignment_id: number;
  bus_number: string;
  capacity: number;
  driver_name: string;
  phone: string;
  route_name: string;
  origin: string;
  destination: string;
  shift_start: string;
  shift_end: string;
}

export function useBusTracking(routeId: number | null, token: string | null) {
  const [busLocations, setBusLocations] = useState<Record<number, BusLocation>>({});
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const newSocket = io(apiUrl, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('Socket connected to server');
      if (routeId) {
        newSocket.emit('subscribe:route', { route_id: routeId });
      }
    });

    newSocket.on('bus:location', (data: BusLocation) => {
      setBusLocations(prev => ({
        ...prev,
        [data.bus_id]: data
      }));
    });

    setSocket(newSocket);

    return () => {
      if (routeId) {
        newSocket.emit('unsubscribe:route', { route_id: routeId });
      }
      newSocket.disconnect();
    };
  }, [routeId, token]);

  // Handle route changes on existing socket
  useEffect(() => {
    if (socket && routeId) {
      socket.emit('subscribe:route', { route_id: routeId });
      return () => {
        socket.emit('unsubscribe:route', { route_id: routeId });
      };
    }
  }, [routeId, socket]);

  return busLocations;
}
