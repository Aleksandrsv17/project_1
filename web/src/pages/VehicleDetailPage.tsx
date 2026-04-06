import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Star, Shield, Clock, ChevronRight, Check } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function VehicleDetailPage() {
  const { id } = useParams();
  const { token } = useAuthStore();
  const navigate = useNavigate();

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => api.get(`/vehicles/${id}`).then(r => r.data?.data),
  });

  if (isLoading) return (
    <div className="flex justify-center py-32">
      <div className="animate-spin w-10 h-10 border-4 border-gray-200 rounded-full" style={{ borderTopColor: '#c9a84c' }} />
    </div>
  );
  if (!vehicle) return <div className="text-center py-32 text-gray-500">Vehicle not found</div>;

  const handleBook = () => {
    if (!token) { navigate('/login', { state: { from: `/book/${id}` } }); return; }
    navigate(`/book/${id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link to="/vehicles" className="hover:text-gray-700">Fleet</Link>
          <ChevronRight size={14} />
          <span className="text-gray-700 font-medium">{vehicle.make} {vehicle.model}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero image */}
            <div className="card">
              <div className="h-80 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }}>
                <span className="text-9xl">🚗</span>
              </div>
            </div>

            {/* Info */}
            <div className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-extrabold text-gray-900">{vehicle.year} {vehicle.make} {vehicle.model}</h1>
                  {vehicle.location_city && (
                    <div className="flex items-center gap-1 text-gray-400 mt-1">
                      <MapPin size={14} /><span>{vehicle.location_city}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 bg-yellow-50 px-3 py-1 rounded-full">
                  <Star size={14} fill="#f59e0b" className="text-yellow-400" />
                  <span className="text-sm font-semibold text-yellow-700">4.9</span>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap mb-5">
                <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full capitalize font-medium">{vehicle.category}</span>
                <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full font-medium">{vehicle.color}</span>
                {vehicle.chauffeur_available && (
                  <span className="text-xs px-3 py-1 rounded-full font-medium text-white" style={{ background: '#c9a84c' }}>👔 Chauffeur Available</span>
                )}
              </div>

              {vehicle.description && <p className="text-gray-600 leading-relaxed">{vehicle.description}</p>}
            </div>

            {/* Features */}
            <div className="card p-6">
              <h3 className="font-bold text-gray-900 mb-4">What's Included</h3>
              <div className="grid grid-cols-2 gap-3">
                {['Insurance Coverage', 'GPS Tracking', 'Roadside Assistance', '24/7 Support',
                  'Free Cancellation (48h+)', 'Verified Vehicle'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check size={15} className="text-green-500 flex-shrink-0" />{f}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: booking card */}
          <div>
            <div className="card p-6 sticky top-24">
              <div className="mb-6">
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-extrabold text-gray-900">${vehicle.daily_rate}</span>
                  <span className="text-gray-400">/ day</span>
                </div>
                {vehicle.hourly_rate && (
                  <p className="text-sm text-gray-500">${vehicle.hourly_rate} / hour</p>
                )}
              </div>

              {vehicle.chauffeur_available && (
                <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
                  <p className="text-sm font-semibold text-gray-700 mb-1">With Chauffeur</p>
                  <p className="text-2xl font-bold text-gray-900">${vehicle.chauffeur_daily_rate}<span className="text-sm text-gray-400 font-normal"> / day</span></p>
                </div>
              )}

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Shield size={15} className="text-green-500" /><span>Insurance included: $25/day</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock size={15} className="text-blue-500" /><span>Free cancellation 48h before</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin size={15} className="text-vip-gold" /><span>Mileage: {vehicle.max_daily_km ?? 300}km/day included</span>
                </div>
              </div>

              <button onClick={handleBook} className="btn-gold w-full text-base">
                Book This Vehicle
              </button>
              <p className="text-center text-xs text-gray-400 mt-3">No charge until confirmed</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
