import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { MapPin, Car, Navigation } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { api } from '../api/client';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  category: string;
  location_city: string;
  location_lat: number;
  location_lng: number;
  location_address: string;
  is_available: boolean;
  daily_rate: string;
  owner_name: string;
  status: string;
}

interface Booking {
  id: string;
  status: string;
  mode: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  vehicle_make: string;
  vehicle_model: string;
  total_amount: string;
}

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 25.2048, lng: 55.2708 }; // Dubai

// Mock nearby vehicles for demo when API has no data
const MOCK_VEHICLES: Vehicle[] = [
  { id: 'v1', make: 'Mercedes', model: 'S-Class', year: 2024, category: 'luxury', location_city: 'Dubai', location_lat: 25.2048, location_lng: 55.2708, location_address: 'Downtown Dubai', is_available: true, daily_rate: '1200', owner_name: 'Ahmed K.', status: 'active' },
  { id: 'v2', make: 'BMW', model: 'X7', year: 2024, category: 'suv', location_city: 'Dubai', location_lat: 25.1972, location_lng: 55.2744, location_address: 'Business Bay', is_available: true, daily_rate: '900', owner_name: 'Sara M.', status: 'active' },
  { id: 'v3', make: 'Porsche', model: 'Cayenne', year: 2023, category: 'sports', location_city: 'Dubai', location_lat: 25.2176, location_lng: 55.2839, location_address: 'DIFC', is_available: false, daily_rate: '1100', owner_name: 'Omar R.', status: 'active' },
  { id: 'v4', make: 'Range Rover', model: 'Sport', year: 2024, category: 'suv', location_city: 'Dubai', location_lat: 25.0759, location_lng: 55.1349, location_address: 'Dubai Marina', is_available: true, daily_rate: '850', owner_name: 'Fatima A.', status: 'active' },
  { id: 'v5', make: 'Rolls-Royce', model: 'Ghost', year: 2023, category: 'luxury', location_city: 'Dubai', location_lat: 25.1124, location_lng: 55.1390, location_address: 'Palm Jumeirah', is_available: true, daily_rate: '3500', owner_name: 'Khalid B.', status: 'active' },
  { id: 'v6', make: 'Lamborghini', model: 'Urus', year: 2024, category: 'sports', location_city: 'Dubai', location_lat: 25.2285, location_lng: 55.2866, location_address: 'City Walk', is_available: true, daily_rate: '2800', owner_name: 'Noor H.', status: 'active' },
  { id: 'v7', make: 'Bentley', model: 'Bentayga', year: 2023, category: 'luxury', location_city: 'Dubai', location_lat: 25.2532, location_lng: 55.3033, location_address: 'Dubai Creek', is_available: false, daily_rate: '2200', owner_name: 'Rashid L.', status: 'active' },
  { id: 'v8', make: 'Audi', model: 'RS Q8', year: 2024, category: 'suv', location_city: 'Dubai', location_lat: 25.1855, location_lng: 55.2627, location_address: 'Al Quoz', is_available: true, daily_rate: '750', owner_name: 'Layla Z.', status: 'active' },
];

const MOCK_BOOKINGS: Booking[] = [
  { id: 'b1', status: 'active', mode: 'chauffeur', pickup_lat: 25.2048, pickup_lng: 55.2708, pickup_address: 'Downtown Dubai', dropoff_lat: 25.0759, dropoff_lng: 55.1349, dropoff_address: 'Dubai Marina', vehicle_make: 'Mercedes', vehicle_model: 'S-Class', total_amount: '450' },
  { id: 'b2', status: 'confirmed', mode: 'self_drive', pickup_lat: 25.1124, pickup_lng: 55.1390, pickup_address: 'Palm Jumeirah', dropoff_lat: 25.2285, dropoff_lng: 55.2866, dropoff_address: 'City Walk', vehicle_make: 'BMW', vehicle_model: 'X7', total_amount: '320' },
];

type MarkerType = 'vehicles' | 'bookings' | 'all';

export default function LiveMapPage() {
  const [selected, setSelected] = useState<Vehicle | Booking | null>(null);
  const [selectedType, setSelectedType] = useState<'vehicle' | 'booking'>('vehicle');
  const [filter, setFilter] = useState<MarkerType>('all');
  const mapRef = useRef<google.maps.Map | null>(null);

  const { data: apiVehicles } = useQuery<Vehicle[]>({
    queryKey: ['vehicles-map'],
    queryFn: () => api.get('/vehicles?limit=200').then(r => r.data?.data?.vehicles ?? []),
    retry: 1,
  });

  const { data: apiBookings } = useQuery<Booking[]>({
    queryKey: ['bookings-active'],
    queryFn: () => api.get('/bookings?status=active').then(r => r.data?.data ?? []),
    retry: 1,
  });

  // Use API data if available, otherwise use mock data for demo
  const vehicles = (apiVehicles && apiVehicles.length > 0) ? apiVehicles : MOCK_VEHICLES;
  const bookings = (apiBookings && apiBookings.length > 0) ? apiBookings : MOCK_BOOKINGS;

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const availableCount = vehicles.filter(v => v.is_available).length;
  const activeTrips = bookings.filter(b => b.status === 'active').length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Live Map</h2>
            <p className="text-gray-500 text-sm mt-1">Real-time view of vehicles and trips</p>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg">
              <Car size={16} className="text-green-600" />
              <span className="text-sm font-semibold text-green-700">{availableCount} Available</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ backgroundColor: '#c9a84c20' }}>
              <Navigation size={16} style={{ color: '#c9a84c' }} />
              <span className="text-sm font-semibold" style={{ color: '#c9a84c' }}>{activeTrips} Active Trips</span>
            </div>
          </div>
        </div>

        {/* Filter toggles */}
        <div className="flex gap-2 mt-4">
          {(['all', 'vehicles', 'bookings'] as MarkerType[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
                filter === f ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={filter === f ? { backgroundColor: '#1a1a2e' } : {}}>
              {f === 'all' ? 'All' : f === 'vehicles' ? 'Vehicles' : 'Active Trips'}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={12}
          onLoad={onLoad}
          options={{
            styles: [
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            ],
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
          }}
        >
          {/* Vehicle markers */}
          {(filter === 'all' || filter === 'vehicles') &&
            vehicles.map((v) => (
              <Marker
                key={`v-${v.id}`}
                position={{ lat: v.location_lat, lng: v.location_lng }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: v.is_available ? '#10b981' : '#ef4444',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                }}
                onClick={() => { setSelected(v); setSelectedType('vehicle'); }}
              />
            ))}

          {/* Booking pickup markers */}
          {(filter === 'all' || filter === 'bookings') &&
            bookings.map((b) => (
              <Marker
                key={`b-${b.id}`}
                position={{ lat: b.pickup_lat, lng: b.pickup_lng }}
                icon={{
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  scale: 6,
                  fillColor: '#c9a84c',
                  fillOpacity: 1,
                  strokeColor: '#1a1a2e',
                  strokeWeight: 2,
                  rotation: 0,
                }}
                onClick={() => { setSelected(b); setSelectedType('booking'); }}
              />
            ))}

          {/* Info Window */}
          {selected && selectedType === 'vehicle' && (
            <InfoWindow
              position={{ lat: (selected as Vehicle).location_lat, lng: (selected as Vehicle).location_lng }}
              onCloseClick={() => setSelected(null)}
            >
              <div className="p-2 min-w-[200px]">
                <p className="font-bold text-gray-900">
                  {(selected as Vehicle).year} {(selected as Vehicle).make} {(selected as Vehicle).model}
                </p>
                <p className="text-xs text-gray-500 mt-1">{(selected as Vehicle).location_address}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${(selected as Vehicle).is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {(selected as Vehicle).is_available ? 'Available' : 'Booked'}
                  </span>
                  <span className="text-xs text-gray-500">{(selected as Vehicle).category}</span>
                </div>
                <p className="text-sm font-semibold mt-2" style={{ color: '#c9a84c' }}>
                  AED {(selected as Vehicle).daily_rate}/day
                </p>
                <p className="text-xs text-gray-400 mt-1">Owner: {(selected as Vehicle).owner_name}</p>
              </div>
            </InfoWindow>
          )}

          {selected && selectedType === 'booking' && (
            <InfoWindow
              position={{ lat: (selected as Booking).pickup_lat, lng: (selected as Booking).pickup_lng }}
              onCloseClick={() => setSelected(null)}
            >
              <div className="p-2 min-w-[200px]">
                <p className="font-bold text-gray-900">
                  {(selected as Booking).vehicle_make} {(selected as Booking).vehicle_model}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs"><span className="text-green-600 font-medium">Pickup:</span> {(selected as Booking).pickup_address}</p>
                  <p className="text-xs"><span className="text-red-600 font-medium">Dropoff:</span> {(selected as Booking).dropoff_address}</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {(selected as Booking).status}
                  </span>
                  <span className="text-xs text-gray-500">{(selected as Booking).mode}</span>
                </div>
                <p className="text-sm font-semibold mt-2" style={{ color: '#c9a84c' }}>
                  AED {(selected as Booking).total_amount}
                </p>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
            <span className="text-gray-600">Available Vehicle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            <span className="text-gray-600">Booked Vehicle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 inline-block" style={{ color: '#c9a84c' }}>▲</span>
            <span className="text-gray-600">Active Trip</span>
          </div>
        </div>
      </div>
    </div>
  );
}
