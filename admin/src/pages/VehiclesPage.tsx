import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';

interface Vehicle { id: string; make: string; model: string; year: number; category: string; daily_rate: string; status: string; location_city: string; }

export default function VehiclesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles-admin'],
    queryFn: () => api.get('/vehicles?limit=100&status=all').then(r => r.data?.data?.vehicles ?? []),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/vehicles/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles-admin'] }),
  });

  const columns = [
    { key: 'id', label: 'ID', render: (r: Vehicle) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
    { key: 'vehicle', label: 'Vehicle', render: (r: Vehicle) => `${r.year} ${r.make} ${r.model}` },
    { key: 'category', label: 'Category', render: (r: Vehicle) => <StatusBadge status={r.category} /> },
    { key: 'daily_rate', label: 'Daily Rate', render: (r: Vehicle) => `$${r.daily_rate}` },
    { key: 'location_city', label: 'City' },
    { key: 'status', label: 'Status', render: (r: Vehicle) => <StatusBadge status={r.status} /> },
    {
      key: 'actions', label: 'Actions',
      render: (r: Vehicle) => (
        <div className="flex gap-2">
          {r.status === 'pending' && (
            <>
              <button onClick={() => updateStatus.mutate({ id: r.id, status: 'active' })}
                className="text-xs px-3 py-1 rounded font-medium text-white" style={{ backgroundColor: '#10b981' }}>
                Approve
              </button>
              <button onClick={() => updateStatus.mutate({ id: r.id, status: 'inactive' })}
                className="text-xs px-3 py-1 rounded font-medium text-white bg-red-500">
                Reject
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Vehicles</h2>
        <p className="text-gray-500 text-sm mt-1">{data?.length ?? 0} vehicles in marketplace</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <DataTable columns={columns} data={data ?? []} loading={isLoading} />
      </div>
    </div>
  );
}
