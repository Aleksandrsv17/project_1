import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ChevronLeft, Car, Info } from 'lucide-react';

const CATEGORIES = ['sedan', 'suv', 'coupe', 'convertible', 'van', 'truck'];

type FormData = {
  make: string; model: string; year: string; license_plate: string;
  color: string; category: string; daily_rate: string; hourly_rate: string;
  chauffeur_available: boolean; chauffeur_daily_rate: string;
  deposit_amount: string; max_daily_km: string;
  location_city: string; description: string;
};

const INIT: FormData = {
  make: '', model: '', year: '', license_plate: '', color: '',
  category: 'suv', daily_rate: '', hourly_rate: '',
  chauffeur_available: false, chauffeur_daily_rate: '',
  deposit_amount: '500', max_daily_km: '300',
  location_city: '', description: '',
};

export default function AddVehiclePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormData>(INIT);
  const [error, setError] = useState('');

  const set = (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const setCheck = (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [k]: e.target.checked }));

  const mutation = useMutation({
    mutationFn: (payload: any) => api.post('/vehicles', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-vehicles'] });
      navigate('/owner/vehicles');
    },
    onError: (err: any) => setError(err?.response?.data?.message || 'Failed to create vehicle'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: any = {
      make: form.make.trim(),
      model: form.model.trim(),
      year: parseInt(form.year),
      license_plate: form.license_plate.trim(),
      category: form.category,
      daily_rate: parseFloat(form.daily_rate),
      chauffeur_available: form.chauffeur_available,
      deposit_amount: parseFloat(form.deposit_amount) || 500,
      max_daily_km: parseInt(form.max_daily_km) || 300,
    };
    if (form.color.trim()) payload.color = form.color.trim();
    if (form.hourly_rate) payload.hourly_rate = parseFloat(form.hourly_rate);
    if (form.chauffeur_available && form.chauffeur_daily_rate)
      payload.chauffeur_daily_rate = parseFloat(form.chauffeur_daily_rate);
    if (form.location_city.trim()) payload.location_city = form.location_city.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    mutation.mutate(payload);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Link to="/owner/vehicles" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ChevronLeft size={16} /> Back to My Fleet
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#1a1a2e' }}>
          <Car size={22} style={{ color: '#c9a84c' }} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">List a Vehicle</h1>
          <p className="text-gray-500 text-sm">Add your luxury car to the platform</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-5">Vehicle Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Make *</label>
              <input className="input" placeholder="BMW" value={form.make} onChange={set('make')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Model *</label>
              <input className="input" placeholder="X7" value={form.model} onChange={set('model')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Year *</label>
              <input className="input" type="number" placeholder="2024" min={1990} max={2026}
                value={form.year} onChange={set('year')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">License Plate *</label>
              <input className="input" placeholder="ABC-123" value={form.license_plate} onChange={set('license_plate')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
              <input className="input" placeholder="Pearl White" value={form.color} onChange={set('color')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category *</label>
              <select className="input" value={form.category} onChange={set('category')} required>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea className="input resize-none" rows={3}
              placeholder="Describe your vehicle, features, condition..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>

        {/* Pricing */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-5">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Daily Rate (USD) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input className="input pl-7" type="number" placeholder="500" min={1} step={0.01}
                  value={form.daily_rate} onChange={set('daily_rate')} required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Hourly Rate (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input className="input pl-7" type="number" placeholder="80" min={1} step={0.01}
                  value={form.hourly_rate} onChange={set('hourly_rate')} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Security Deposit (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input className="input pl-7" type="number" placeholder="500" min={0} step={0.01}
                  value={form.deposit_amount} onChange={set('deposit_amount')} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Daily KM</label>
              <input className="input" type="number" placeholder="300" min={1}
                value={form.max_daily_km} onChange={set('max_daily_km')} />
            </div>
          </div>
        </div>

        {/* Chauffeur */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-5">Chauffeur Service</h2>
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input type="checkbox" className="w-5 h-5 rounded accent-yellow-500"
              checked={form.chauffeur_available} onChange={setCheck('chauffeur_available')} />
            <div>
              <p className="font-medium text-gray-900">Available with chauffeur</p>
              <p className="text-sm text-gray-500">Customers can book this car with a professional driver</p>
            </div>
          </label>
          {form.chauffeur_available && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Chauffeur Daily Rate (USD) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input className="input pl-7" type="number" placeholder="600" min={1} step={0.01}
                  value={form.chauffeur_daily_rate} onChange={set('chauffeur_daily_rate')} required={form.chauffeur_available} />
              </div>
            </div>
          )}
        </div>

        {/* Location */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-5">Location</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
            <input className="input" placeholder="Dubai" value={form.location_city} onChange={set('location_city')} />
          </div>
        </div>

        {/* Info */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl text-sm text-blue-700">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <p>Platform commission is <strong>20%</strong> on all bookings. Insurance fee of <strong>$25/day</strong> is added automatically.</p>
        </div>

        {error && <p className="text-red-500 text-sm bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

        <div className="flex gap-4">
          <Link to="/owner/vehicles"
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors text-center">
            Cancel
          </Link>
          <button type="submit" disabled={mutation.isPending}
            className="flex-1 btn-gold disabled:opacity-60">
            {mutation.isPending ? 'Listing…' : 'List Vehicle'}
          </button>
        </div>
      </form>
    </div>
  );
}
