import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';

interface Payment { id: string; booking_id: string; amount: string; currency: string; status: string; type: string; created_at: string; }

export default function PaymentsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Payment[]>({
    queryKey: ['payments-admin'],
    queryFn: () => api.get('/payments').then(r => r.data?.data ?? []),
  });

  const refund = useMutation({
    mutationFn: (id: string) => api.post(`/payments/${id}/refund`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments-admin'] }),
  });

  const columns = [
    { key: 'id', label: 'ID', render: (r: Payment) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
    { key: 'booking_id', label: 'Booking', render: (r: Payment) => <span className="font-mono text-xs">{r.booking_id.slice(0, 8)}…</span> },
    { key: 'amount', label: 'Amount', render: (r: Payment) => `$${r.amount} ${r.currency}` },
    { key: 'type', label: 'Type', render: (r: Payment) => <StatusBadge status={r.type} /> },
    { key: 'status', label: 'Status', render: (r: Payment) => <StatusBadge status={r.status} /> },
    { key: 'created_at', label: 'Date', render: (r: Payment) => new Date(r.created_at).toLocaleDateString() },
    {
      key: 'actions', label: 'Actions',
      render: (r: Payment) => (
        r.status === 'completed' ? (
          <button onClick={() => { if (confirm('Issue refund?')) refund.mutate(r.id); }}
            className="text-xs px-3 py-1 rounded font-medium text-white bg-red-500 hover:bg-red-600">
            Refund
          </button>
        ) : null
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Payments</h2>
        <p className="text-gray-500 text-sm mt-1">{data?.length ?? 0} transactions</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <DataTable columns={columns} data={data ?? []} loading={isLoading} />
      </div>
    </div>
  );
}
