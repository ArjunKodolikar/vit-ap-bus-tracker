import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { BusLocation } from '../hooks/useBusTracking';
import { Bus, MapPin } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

// Fix Leaflet marker icons
const busIcon = L.divIcon({
  html: renderToStaticMarkup(<div className="bg-blue-600 p-2 rounded-full border-2 border-white shadow-lg text-white"><Bus size={20} /></div>),
  className: 'custom-bus-icon',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const stopIcon = L.divIcon({
  html: renderToStaticMarkup(<div className="bg-red-500 p-1 rounded-full border-2 border-white shadow-md text-white"><MapPin size={16} /></div>),
  className: 'custom-stop-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface MapProps {
  center: [number, number];
  busLocations: Record<number, BusLocation>;
  stops: any[];
  onBusSelect?: (busId: number) => void;
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 14);
  return null;
}

export default function Map({ center, busLocations, stops, onBusSelect }: MapProps) {
  return (
    <div className="h-full w-full relative">
      <MapContainer center={center} zoom={14} scrollWheelZoom={true} className="z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ChangeView center={center} />
        
        {/* Bus Markers */}
        {Object.values(busLocations).map((bus) => (
          <Marker 
            key={bus.bus_id} 
            position={[bus.latitude, bus.longitude]} 
            icon={busIcon}
            eventHandlers={{
              click: () => onBusSelect && onBusSelect(bus.bus_id)
            }}
          >
            <Popup>
              <div className="p-1">
                <h3 className="font-bold">Bus ID: {bus.bus_id}</h3>
                <p className="text-sm">Speed: {bus.speed} km/h</p>
                <p className="text-xs text-gray-500">Updated: {new Date(bus.updated_at * 1000).toLocaleTimeString()}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Stop Markers */}
        {stops.map((stop) => (
          <Marker 
            key={stop.stop_id} 
            position={[stop.latitude, stop.longitude]} 
            icon={stopIcon}
          >
            <Popup>
              <div className="p-1 text-center">
                <p className="font-semibold">{stop.stop_name}</p>
                <p className="text-xs text-gray-500">Stop #{stop.sequence}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
