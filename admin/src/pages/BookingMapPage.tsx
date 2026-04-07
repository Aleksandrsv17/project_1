import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GoogleMap, Marker, InfoWindow, DirectionsRenderer } from '@react-google-maps/api';
import { Navigation, Clock, DollarSign } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { api } from '../api/client';

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
  vehicle_year: number;
  total_amount: string;
  start_time: string;
  end_time: string;
  customer_name: string;
}

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 25.2048, lng: 55.2708 };

const MOCK_BOOKINGS: Booking[] = [
  { id: 'b1', status: 'active', mode: 'chauffeur', pickup_lat: 25.2048, pickup_lng: 55.2708, pickup_address: 'Downtown Dubai, Burj Khalifa Blvd', dropoff_lat: 25.0759, dropoff_lng: 55.1349, dropoff_address: 'Dubai Marina, Marina Walk', vehicle_make: 'Mercedes', vehicle_model: 'S-Class', vehicle_year: 2024, total_amount: '450', start_time: '2026-04-07T09:00:00Z', end_time: '2026-04-07T12:00:00Z', customer_name: 'John D.' },
  { id: 'b2', status: 'active', mode: 'self_drive', pickup_lat: 25.1124, pickup_lng: 55.1390, pickup_address: 'Palm Jumeirah, Crescent Rd', dropoff_lat: 25.2285, dropoff_lng: 55.2866, dropoff_address: 'City Walk, Al Wasl', vehicle_make: 'BMW', vehicle_model: 'X7', vehicle_year: 2024, total_amount: '320', start_time: '2026-04-07T10:00:00Z', end_time: '2026-04-07T18:00:00Z', customer_name: 'Sarah K.' },
  { id: 'b3', status: 'confirmed', mode: 'chauffeur', pickup_lat: 25.2176, pickup_lng: 55.2839, pickup_address: 'DIFC, Gate Village', dropoff_lat: 25.0867, dropoff_lng: 55.1428, dropoff_address: 'JBR, The Walk', vehicle_make: 'Rolls-Royce', vehicle_model: 'Ghost', vehicle_year: 2023, total_amount: '1200', start_time: '2026-04-07T14:00:00Z', end_time: '2026-04-07T20:00:00Z', customer_name: 'Mike R.' },
  { id: 'b4', status: 'pending', mode: 'self_drive', pickup_lat: 25.2532, pickup_lng: 55.3033, pickup_address: 'Dubai Creek, Festival City', dropoff_lat: 25.1972, dropoff_lng: 55.2744, dropoff_address: 'Business Bay', vehicle_make: 'Porsche', vehicle_model: 'Cayenne', vehicle_year: 2023, total_amount: '680', start_time: '2026-04-08T08:00:00Z', end_time: '2026-04-08T20:00:00Z', customer_name: 'Anna L.' },
  { id: 'b5', status: 'completed', mode: 'chauffeur', pickup_lat: 25.1855, pickup_lng: 55.2627, pickup_address: 'Al Quoz, Alserkal Avenue', dropoff_lat: 25.2360, dropoff_lng: 55.3150, dropoff_address: 'Deira, Gold Souk', vehicle_make: 'Bentley', vehicle_model: 'Bentayga', vehicle_year: 2023, total_amount: '950', start_time: '2026-04-06T15:00:00Z', end_time: '2026-04-06T19:00:00Z', customer_name: 'David W.' },
];

const statusColors: Record<string, string> = {
  active: '#10b981',
  confirmed: '#3b82f6',
  pending: '#f59e0b',
  completed: '#6b7280',
  cancelled: '#ef4444',
};

export default function BookingMapPage() {
  const [selected, setSelected] = useState<Booking | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const mapRef = useRef<google.maps.Map | null>(null);

  const { data: apiBookings } = useQuery<Booking[]>({
    queryKey: ['bookings-map'],
    queryFn: () => api.get('/bookings?limit=100').then(r => r.data?.data ?? []),
    retry: 1,
  });

  const allBookings = (apiBookings && apiBookings.length > 0) ? apiBookings : MOCK_BOOKINGS;
  const bookings = statusFilter === 'all' ? allBookings : allBookings.filter(b => b.status === statusFilter);

  const onLoad = useCallback((map: google.maps.Map) => { mapRef.current = map; }, []);

  // Fetch directions when a booking is selected
  useEffect(() => {
    if (!selected) { setDirections(null); return; }

    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: selected.pickup_lat, lng: selected.pickup_lng },
        destination: { lat: selected.dropoff_lat, lng: selected.dropoff_lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          setDirections(result);
          // Fit map to route bounds
          if (result.routes[0]?.bounds && mapRef.current) {
            mapRef.current.fitBounds(result.routes[0].bounds);
          }
        } else {
          setDirections(null);
        }
      }
    );
  }, [selected]);

  const STATUSES = ['all', 'active', 'confirmed', 'pending', 'completed'];

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Booking Routes</h3>
          <p className="text-xs text-gray-500 mt-1">Select a booking to see its route</p>

          <div className="flex flex-wrap gap-1.5 mt-3">
            {STATUSES.map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); setSelected(null); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                  statusFilter === s ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={statusFilter === s ? { backgroundColor: statusColors[s] ?? '#1a1a2e' } : {}}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {bookings.map(b => (
            <button key={b.id} onClick={() => setSelected(b)}
              className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selected?.id === b.id ? 'bg-yellow-50' : ''}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {b.vehicle_make} {b.vehicle_model}
                </p>
                <StatusBadge status={b.status} />
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                  <span className="text-xs text-gray-500 leading-tight">{b.pickup_address}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                  <span className="text-xs text-gray-500 leading-tight">{b.dropoff_address}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{b.customer_name} · {b.mode}</span>
                <span className="text-xs font-semibold" style={{ color: '#c9a84c' }}>AED {b.total_amount}</span>
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
          {/* Show all booking pickup markers when none selected */}
          {!selected && bookings.map(b => (
            <Marker
              key={b.id}
              position={{ lat: b.pickup_lat, lng: b.pickup_lng }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: statusColors[b.status] ?? '#666',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
              }}
              onClick={() => setSelected(b)}
            />
          ))}

          {/* Directions route for selected booking */}
          {selected && directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                polylineOptions: {
                  strokeColor: '#c9a84c',
                  strokeWeight: 5,
                  strokeOpacity: 0.8,
                },
                suppressMarkers: true,
              }}
            />
          )}

          {/* Custom pickup/dropoff markers for selected */}
          {selected && (
            <>
              <Marker
                position={{ lat: selected.pickup_lat, lng: selected.pickup_lng }}
                label={{ text: 'A', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 14,
                  fillColor: '#10b981',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 3,
                }}
              />
              <Marker
                position={{ lat: selected.dropoff_lat, lng: selected.dropoff_lng }}
                label={{ text: 'B', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 14,
                  fillColor: '#ef4444',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 3,
                }}
              />
            </>
          )}
        </GoogleMap>

        {/* Selected booking info card */}
        {selected && (
          <div className="absolute top-4 right-4 bg-white rounded-xl shadow-lg p-5 w-80 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-gray-900">
                {selected.vehicle_year} {selected.vehicle_make} {selected.vehicle_model}
              </p>
              <StatusBadge status={selected.status} />
            </div>

            <div className="space-y-2 mb-3">
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Pickup</p>
                  <p className="text-sm text-gray-700">{selected.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Drop-off</p>
                  <p className="text-sm text-gray-700">{selected.dropoff_address}</p>
                </div>
              </div>
            </div>

            {directions?.routes?.[0]?.legs?.[0] && (
              <div className="flex gap-3 py-2 px-3 rounded-lg mb-3" style={{ backgroundColor: '#1a1a2e' }}>
                <div className="flex items-center gap-1">
                  <Navigation size={12} style={{ color: '#c9a84c' }} />
                  <span className="text-xs font-medium" style={{ color: '#c9a84c' }}>
                    {directions.routes[0].legs[0].distance?.text}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock size={12} style={{ color: '#c9a84c' }} />
                  <span className="text-xs font-medium" style={{ color: '#c9a84c' }}>
                    {directions.routes[0].legs[0].duration?.text}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-gray-400">Customer:</span> <span className="font-medium">{selected.customer_name}</span></div>
              <div><span className="text-gray-400">Mode:</span> <span className="font-medium capitalize">{selected.mode.replace('_', ' ')}</span></div>
              <div><span className="text-gray-400">Start:</span> <span className="font-medium">{new Date(selected.start_time).toLocaleString()}</span></div>
              <div><span className="text-gray-400">End:</span> <span className="font-medium">{new Date(selected.end_time).toLocaleString()}</span></div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-lg font-bold" style={{ color: '#c9a84c' }}>AED {selected.total_amount}</p>
              <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">
                Clear selection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
