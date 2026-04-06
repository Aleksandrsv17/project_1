import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Plus, Pencil, Trash2, Car, MapPin, DollarSign, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  maintenance: 'bg-orange-100 text-orange-700',
};

const CATEGORY_EMOJI: Record<string, string> = {
  sedan: '🚗', suv: '🚙', coupe: '🏎', convertible: '🚘', van: '🚐', truck: '🛻',
};

export default function MyVehiclesPage() {
  const qc = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['owner-vehicles'],
    queryFn: () => api.get('/vehicles/owner/my-vehicles').then(r => r.data.data),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/vehicles/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner-vehicles'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/vehicles/${id}`),
    onSuccess: () => {
      setDeleteConfirm(null);
      qc.invalidateQueries({ queryKey: ['owner-vehicles'] });
    },
  });

  const vehicles = data?.vehicles ?? [];

  const handleToggle = (v: any) => {
    const next = v.status === 'active' ? 'inactive' : 'active';
    toggleStatus.mutate({ id: v.id, status: next });
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-32 bg-gray-200 rounded-xl mb-4" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">My Fleet</h1>
          <p className="text-gray-500 mt-1">{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} listed</p>
        </div>
        <Link to="/owner/vehicles/add" className="btn-gold flex items-center gap-2">
          <Plus size={16} /> Add Vehicle
        </Link>
      </div>

      {vehicles.length === 0 ? (
        <div className="card p-16 text-center">
          <Car size={56} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-bold text-gray-700 mb-2">No vehicles yet</h2>
          <p className="text-gray-500 mb-6">List your first luxury car and start earning</p>
          <Link to="/owner/vehicles/add" className="btn-gold inline-flex items-center gap-2">
            <Plus size={16} /> Add Your First Vehicle
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map((v: any) => (
            <div key={v.id} className="card overflow-hidden hover:shadow-lg transition-shadow">
              {/* Image placeholder */}
              <div className="h-40 flex items-center justify-center text-6xl" style={{ background: '#1a1a2e' }}>
                {CATEGORY_EMOJI[v.category] ?? '🚗'}
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-gray-900">{v.make} {v.model}</h3>
                    <p className="text-sm text-gray-500">{v.year} · {v.color || 'N/A'}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[v.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {v.status}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <MapPin size={13} /> {v.location_city || '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign size={13} /> ${v.daily_rate}/day
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Toggle active/inactive */}
                  <button
                    onClick={() => handleToggle(v)}
                    disabled={toggleStatus.isPending}
                    className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    title={v.status === 'active' ? 'Deactivate' : 'Activate'}
                  >
                    {v.status === 'active'
                      ? <ToggleRight size={16} className="text-green-500" />
                      : <ToggleLeft size={16} className="text-gray-400" />}
                    <span className="hidden sm:inline">{v.status === 'active' ? 'Active' : 'Inactive'}</span>
                  </button>

                  <Link
                    to={`/owner/vehicles/${v.id}/edit`}
                    className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex-1 justify-center"
                  >
                    <Pencil size={14} /> Edit
                  </Link>

                  <button
                    onClick={() => setDeleteConfirm(v.id)}
                    className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-8 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle size={24} className="text-red-500 flex-shrink-0" />
              <h3 className="text-lg font-bold text-gray-900">Delete vehicle?</h3>
            </div>
            <p className="text-gray-600 mb-6">This will permanently remove the listing. Active bookings may be affected.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
