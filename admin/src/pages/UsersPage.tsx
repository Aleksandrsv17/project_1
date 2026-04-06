import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';

interface User { id: string; first_name: string; last_name: string; email: string; role: string; kyc_status: string; created_at: string; }

export default function UsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data?.data ?? []),
  });

  const approveKyc = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}`, { kyc_status: 'approved' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const columns = [
    { key: 'id', label: 'ID', render: (r: User) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
    { key: 'name', label: 'Name', render: (r: User) => `${r.first_name} ${r.last_name}` },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: (r: User) => <StatusBadge status={r.role} /> },
    { key: 'kyc_status', label: 'KYC', render: (r: User) => <StatusBadge status={r.kyc_status} /> },
    { key: 'created_at', label: 'Joined', render: (r: User) => new Date(r.created_at).toLocaleDateString() },
    {
      key: 'actions', label: 'Actions',
      render: (r: User) => (
        <div className="flex gap-2">
          {r.kyc_status === 'submitted' && (
            <button onClick={() => approveKyc.mutate(r.id)}
              className="text-xs px-3 py-1 rounded font-medium text-white"
              style={{ backgroundColor: '#c9a84c' }}>
              Approve KYC
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        <p className="text-gray-500 text-sm mt-1">{data?.length ?? 0} registered users</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <DataTable columns={columns} data={data ?? []} loading={isLoading} />
      </div>
    </div>
  );
}
