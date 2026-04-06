import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../api/client';
import VehicleCard from '../components/VehicleCard';

const CATEGORIES = ['all', 'sedan', 'suv', 'coupe', 'convertible', 'limousine'];

export default function VehiclesPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [mode, setMode] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', category, mode],
    queryFn: () => {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (mode !== 'all') params.set('chauffeur_available', mode === 'chauffeur' ? 'true' : 'false');
      params.set('status', 'active');
      return api.get(`/vehicles?${params}`).then(r => r.data?.data?.vehicles ?? []);
    },
  });

  const filtered = (data ?? []).filter((v: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${v.make} ${v.model} ${v.location_city}`.toLowerCase().includes(q);
    const matchPrice = !maxPrice || parseFloat(v.daily_rate) <= parseFloat(maxPrice);
    return matchSearch && matchPrice;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }} className="py-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl font-extrabold text-white mb-3">Our Luxury Fleet</h1>
          <p className="text-gray-300">Choose from our curated collection of premium vehicles</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-52">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Search make, model, city…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input w-auto" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="all">All Modes</option>
              <option value="chauffeur">Chauffeur Available</option>
              <option value="self_drive">Self-Drive Only</option>
            </select>
            <input className="input w-36" type="number" placeholder="Max $/day"
              value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
            {(search || mode !== 'all' || maxPrice) && (
              <button onClick={() => { setSearch(''); setMode('all'); setMaxPrice(''); }}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm px-3">
                <X size={14} /> Clear
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${
                  category === c ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={category === c ? { background: '#c9a84c' } : {}}>
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin w-10 h-10 border-4 border-gray-200 rounded-full" style={{ borderTopColor: '#c9a84c' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🚗</p>
            <p className="text-gray-500 text-lg">No vehicles found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-sm mb-5"><span className="font-semibold text-gray-800">{filtered.length}</span> vehicles available</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((v: any) => <VehicleCard key={v.id} v={v} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
