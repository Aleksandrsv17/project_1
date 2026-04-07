import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GoogleMap, Marker, InfoWindow, Circle } from '@react-google-maps/api';
import { Car, Filter } from 'lucide-react';
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
  hourly_rate: string;
  owner_name: string;
  status: string;
  seats: number;
  transmission: string;
  fuel_type: string;
  rating: number;
  chauffeur_available: boolean;
}

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 25.2048, lng: 55.2708 };

const CATEGORIES = ['all', 'sedan', 'suv', 'luxury', 'sports', 'van'];

const MOCK_VEHICLES: Vehicle[] = [
  { id: 'v1', make: 'Mercedes', model: 'S-Class', year: 2024, category: 'luxury', location_city: 'Dubai', location_lat: 25.2048, location_lng: 55.2708, location_address: 'Downtown Dubai, Burj Khalifa Blvd', is_available: true, daily_rate: '1200', hourly_rate: '180', owner_name: 'Ahmed K.', status: 'active', seats: 5, transmission: 'automatic', fuel_type: 'petrol', rating: 4.8, chauffeur_available: true },
  { id: 'v2', make: 'BMW', model: 'X7', year: 2024, category: 'suv', location_city: 'Dubai', location_lat: 25.1972, location_lng: 55.2744, location_address: 'Business Bay, Bay Avenue', is_available: true, daily_rate: '900', hourly_rate: '140', owner_name: 'Sara M.', status: 'active', seats: 7, transmission: 'automatic', fuel_type: 'diesel', rating: 4.6, chauffeur_available: true },
  { id: 'v3', make: 'Porsche', model: 'Cayenne', year: 2023, category: 'sports', location_city: 'Dubai', location_lat: 25.2176, location_lng: 55.2839, location_address: 'DIFC, Gate Village', is_available: false, daily_rate: '1100', hourly_rate: '170', owner_name: 'Omar R.', status: 'active', seats: 5, transmission: 'automatic', fuel_type: 'petrol', rating: 4.7, chauffeur_available: false },
  { id: 'v4', make: 'Range Rover', model: 'Sport', year: 2024, category: 'suv', location_city: 'Dubai', location_lat: 25.0759, location_lng: 55.1349, location_address: 'Dubai Marina, Marina Walk', is_available: true, daily_rate: '850', hourly_rate: '130', owner_name: 'Fatima A.', status: 'active', seats: 5, transmission: 'automatic', fuel_type: 'diesel', rating: 4.5, chauffeur_available: true },
  { id: 'v5', make: 'Rolls-Royce', model: 'Ghost', year: 2023, category: 'luxury', location_city: 'Dubai', location_lat: 25.1124, location_lng: 55.1390, location_address: 'Palm Jumeirah, Crescent Rd', is_available: true, daily_rate: '3500', hourly_rate: '500', owner_name: 'Khalid B.', status: 'active', seats: 5, transmission: 'automatic', fuel_type: 'petrol', rating: 5.0, chauffeur_available: true },
  { id: 'v6', make: 'Lamborghini', model: 'Urus', year: 2024, category: 'sports', location_city: 'Dubai', location_lat: 25.2285, location_lng: 55.2866, location_address: 'City Walk, Al Wasl', is_available: true, daily_rate: '2800', hourly_rate: '420', owner_name: 'Noor H.', status: 'active', seats: 5, transmission: 'automatic', fuel_type: 'petrol', rating: 4.9, chauffeur_available: false },
  { id: 'v7', make: 'Bentley', model: 'Bentayga', year: 2023, category: 'luxury', location_city: 'Dubai', location_lat: 25.2532, location_lng: 55.3033, location_address: 'Dubai Creek, Festival City', is_available: false, daily_rate: '2200', hourly_rate: '330', owner_name: 'Rashid L.', status: 'active', seats: 5, transmission: 'automatic', fuel_type: 'petrol', rating: 4.7, chauffeur_available: true },
  { id: 'v8', make: 'Audi', model: 'RS Q8', year: 2024, category: 'suv', location_city: 'Dubai', location_lat: 25.1855, location_lng: 55.2627, location_address: 'Al Quoz, Alserkal Avenue', is_available: true, daily_rate: '750', hourly_rate: '120', owner_name: 'Layla Z.', status: 'active', seats: 5, transmission: 'automatic', fuel_type: 'petrol', rating: 4.4, chauffeur_available: false },
  { id: 'v9', make: 'Ferrari', model: 'Roma', year: 2024, category: 'sports', location_city: 'Dubai', location_lat: 25.0867, location_lng: 55.1428, location_address: 'JBR, The Walk', is_available: true, daily_rate: '3200', hourly_rate: '480', owner_name: 'Hassan T.', status: 'active', seats: 2, transmission: 'automatic', fuel_type: 'petrol', rating: 4.9, chauffeur_available: false },
  { id: 'v10', make: 'Toyota', model: 'Land Cruiser', year: 2024, category: 'suv', location_city: 'Dubai', location_lat: 25.2360, location_lng: 55.3150, location_address: 'Deira, Gold Souk', is_available: true, daily_rate: '500', hourly_rate: '80', owner_name: 'Maryam K.', status: 'active', seats: 8, transmission: 'automatic', fuel_type: 'diesel', rating: 4.3, chauffeur_available: true },
];

const categoryColors: Record<string, string> = {
  luxury: '#c9a84c',
  suv: '#2563eb',
  sports: '#ef4444',
  sedan: '#10b981',
  van: '#8b5cf6',
};

export default function VehicleMapPage() {
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [category, setCategory] = useState('all');
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { data: apiVehicles } = useQuery<Vehicle[]>({
    queryKey: ['vehicles-map-detail'],
    queryFn: () => api.get('/vehicles?limit=200').then(r => r.data?.data?.vehicles ?? []),
    retry: 1,
  });

  const allVehicles = (apiVehicles && apiVehicles.length > 0) ? apiVehicles : MOCK_VEHICLES;

  const vehicles = allVehicles.filter(v => {
    if (category !== 'all' && v.category !== category) return false;
    if (showAvailableOnly && !v.is_available) return false;
    return true;
  });

  const onLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);

  return (
    <div className="h-full flex">
      {/* Sidebar list */}
      <div className="w-80 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Vehicles on Map</h3>
          <p className="text-xs text-gray-500 mt-1">{vehicles.length} vehicles shown</p>

          {/* Category filter */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                  category === c ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={category === c ? { backgroundColor: categoryColors[c] ?? '#1a1a2e' } : {}}>
                {c}
              </button>
            ))}
          </div>

          {/* Available only toggle */}
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={showAvailableOnly} onChange={(e) => setShowAvailableOnly(e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
            <span className="text-xs text-gray-600">Available only</span>
          </label>
        </div>

        {/* Vehicle list */}
        <div className="flex-1 overflow-auto">
          {vehicles.map(v => (
            <button key={v.id} onClick={() => {
              setSelected(v);
              mapRef.current?.panTo({ lat: v.location_lat, lng: v.location_lng });
              mapRef.current?.setZoom(15);
            }}
              className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected?.id === v.id ? 'bg-gray-50' : ''}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">{v.year} {v.make} {v.model}</p>
                <span className={`w-2.5 h-2.5 rounded-full ${v.is_available ? 'bg-green-500' : 'bg-red-400'}`} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{v.location_address}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
                  style={{ backgroundColor: (categoryColors[v.category] ?? '#666') + '20', color: categoryColors[v.category] ?? '#666' }}>
                  {v.category}
                </span>
                <span className="text-xs font-semibold" style={{ color: '#c9a84c' }}>AED {v.daily_rate}/day</span>
              </div>
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
          }}
        >
          {vehicles.map(v => (
            <Marker
              key={v.id}
              position={{ lat: v.location_lat, lng: v.location_lng }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: selected?.id === v.id ? 14 : 10,
                fillColor: categoryColors[v.category] ?? '#666',
                fillOpacity: v.is_available ? 1 : 0.5,
                strokeColor: selected?.id === v.id ? '#1a1a2e' : '#fff',
                strokeWeight: selected?.id === v.id ? 3 : 2,
              }}
              onClick={() => setSelected(v)}
            />
          ))}

          {/* Radius circle around selected */}
          {selected && (
            <Circle
              center={{ lat: selected.location_lat, lng: selected.location_lng }}
              radius={500}
              options={{
                fillColor: categoryColors[selected.category] ?? '#666',
                fillOpacity: 0.08,
                strokeColor: categoryColors[selected.category] ?? '#666',
                strokeOpacity: 0.3,
                strokeWeight: 1,
              }}
            />
          )}

          {selected && (
            <InfoWindow
              position={{ lat: selected.location_lat, lng: selected.location_lng }}
              onCloseClick={() => setSelected(null)}
            >
              <div className="p-2 min-w-[220px]">
                <p className="font-bold text-gray-900 text-base">
                  {selected.year} {selected.make} {selected.model}
                </p>
                <p className="text-xs text-gray-500 mt-1">{selected.location_address}</p>

                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div><span className="text-gray-400">Seats:</span> <span className="font-medium">{selected.seats}</span></div>
                  <div><span className="text-gray-400">Trans:</span> <span className="font-medium capitalize">{selected.transmission}</span></div>
                  <div><span className="text-gray-400">Fuel:</span> <span className="font-medium capitalize">{selected.fuel_type}</span></div>
                  <div><span className="text-gray-400">Rating:</span> <span className="font-medium">{selected.rating}/5</span></div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${selected.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {selected.is_available ? 'Available' : 'Booked'}
                  </span>
                  {selected.chauffeur_available && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Chauffeur
                    </span>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-gray-100">
                  <p className="text-sm font-bold" style={{ color: '#c9a84c' }}>
                    AED {selected.hourly_rate}/hr · AED {selected.daily_rate}/day
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Owner: {selected.owner_name}</p>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  );
}
