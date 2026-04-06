import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ChevronLeft, Car, Save } from 'lucide-react';

const CATEGORIES = ['sedan', 'suv', 'coupe', 'convertible', 'van', 'truck'];
const STATUSES = ['active', 'inactive', 'maintenance'];

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [form, setForm] = useState<Record<string, any>>({});
  const [ready, setReady] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => api.get(`/vehicles/${id}`).then(r => r.data.data.vehicle),
  });

  useEffect(() => {
    if (data && !ready) {
      setForm({
        make: data.make ?? '',
        model: data.model ?? '',
        year: data.year ?? '',
        color: data.color ?? '',
        category: data.category ?? 'suv',
        status: data.status ?? 'active',
        daily_rate: data.daily_rate ?? '',
        hourly_rate: data.hourly_rate ?? '',
        chauffeur_available: data.chauffeur_available ?? false,
        chauffeur_daily_rate: data.chauffeur_daily_rate ?? '',
        deposit_amount: data.deposit_amount ?? '',
        max_daily_km: data.max_daily_km ?? '',
        location_city: data.location_city ?? '',
        description: data.description ?? '',
      });
      setReady(true);
    }
  }, [data, ready]);

  const mutation = useMutation({
    mutationFn: (payload: any) => api.patch(`/vehicles/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicle', id] });
      navigate('/owner/vehicles');
    },
    onError: (err: any) => setError(err?.response?.data?.message || 'Update failed'),
  });

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const setCheck = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [k]: e.target.checked }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: any = {
      make: form.make, model: form.model,
      year: parseInt(form.year), color: form.color,
      category: form.category, status: form.status,
      daily_rate: parseFloat(form.daily_rate),
      chauffeur_available: form.chauffeur_available,
      deposit_amount: parseFloat(form.deposit_amount),
      max_daily_km: parseInt(form.max_daily_km),
      location_city: form.location_city,
      description: form.description,
    };
    if (form.hourly_rate) payload.hourly_rate = parseFloat(form.hourly_rate);
    if (form.chauffeur_available && form.chauffeur_daily_rate)
      payload.chauffeur_daily_rate = parseFloat(form.chauffeur_daily_rate);
    mutation.mutate(payload);
  };

  if (isLoading || !ready) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="card p-6 animate-pulse space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

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
          <h1 className="text-2xl font-extrabold text-gray-900">Edit Vehicle</h1>
          <p className="text-gray-500 text-sm">{data?.make} {data?.model} · {data?.year}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-5">Vehicle Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Make</label>
              <input className="input" value={form.make} onChange={set('make')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
              <input className="input" value={form.model} onChange={set('model')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Year</label>
              <input className="input" type="number" min={1990} max={2026} value={form.year} onChange={set('year')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
              <input className="input" value={form.color} onChange={set('color')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select className="input" value={form.category} onChange={set('category')}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea className="input resize-none" rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>

        {/* Pricing */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-5">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Daily Rate (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input className="input pl-7" type="number" step={0.01} value={form.daily_rate} onChange={set('daily_rate')} required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Hourly Rate (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input className="input pl-7" type="number" step={0.01} value={form.hourly_rate} onChange={set('hourly_rate')} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Security Deposit (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input className="input pl-7" type="number" step={0.01} value={form.deposit_amount} onChange={set('deposit_amount')} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Daily KM</label>
              <input className="input" type="number" value={form.max_daily_km} onChange={set('max_daily_km')} />
            </div>
          </div>
        </div>

        {/* Chauffeur */}
        <div className="card p-6">
          <h2 className="font-bold text-gray-900 mb-5">Chauffeur Service</h2>
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input type="checkbox" className="w-5 h-5 rounded accent-yellow-500"
              checked={form.chauffeur_available} onChange={setCheck('chauffeur_available')} />
            <span className="font-medium text-gray-900">Available with chauffeur</span>
          </label>
          {form.chauffeur_available && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Chauffeur Daily Rate (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input className="input pl-7" type="number" step={0.01} value={form.chauffeur_daily_rate} onChange={set('chauffeur_daily_rate')} />
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

        {error && <p className="text-red-500 text-sm bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

        <div className="flex gap-4">
          <Link to="/owner/vehicles"
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors text-center">
            Cancel
          </Link>
          <button type="submit" disabled={mutation.isPending}
            className="flex-1 btn-gold disabled:opacity-60 flex items-center justify-center gap-2">
            <Save size={16} />
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
