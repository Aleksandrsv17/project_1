import { Link } from 'react-router-dom';
import { MapPin, Users, Fuel } from 'lucide-react';

interface Vehicle {
  id: string; make: string; model: string; year: number;
  category: string; daily_rate: string; hourly_rate?: string;
  chauffeur_available: boolean; location_city?: string;
  description?: string;
}

export default function VehicleCard({ v }: { v: Vehicle }) {
  return (
    <Link to={`/vehicles/${v.id}`} className="card group hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      {/* Image placeholder */}
      <div className="relative h-52 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-6xl">🚗</span>
        </div>
        <div className="absolute top-3 left-3">
          <span className="bg-vip-gold text-white text-xs font-semibold px-2.5 py-1 rounded-full capitalize">{v.category}</span>
        </div>
        {v.chauffeur_available && (
          <div className="absolute top-3 right-3">
            <span className="bg-white/20 backdrop-blur text-white text-xs font-medium px-2.5 py-1 rounded-full">👔 Chauffeur</span>
          </div>
        )}
      </div>

      <div className="p-5">
        <h3 className="font-bold text-gray-900 text-lg">{v.year} {v.make} {v.model}</h3>
        {v.location_city && (
          <div className="flex items-center gap-1 text-gray-400 text-sm mt-1">
            <MapPin size={13} /> <span>{v.location_city}</span>
          </div>
        )}

        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Users size={13} /> 4 seats</span>
          <span className="flex items-center gap-1"><Fuel size={13} /> Premium</span>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div>
            <span className="text-2xl font-bold text-vip-dark">${v.daily_rate}</span>
            <span className="text-gray-400 text-sm"> / day</span>
          </div>
          <span className="text-vip-gold font-semibold text-sm group-hover:underline">Book Now →</span>
        </div>
      </div>
    </Link>
  );
}
