import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';

interface Booking { id: string; type: string; mode: string; status: string; total_amount: string; start_time: string; }

const TABS = ['all', 'pending', 'confirmed', 'active', 'completed', 'cancelled'];

export default function BookingsPage() {
  const [tab, setTab] = useState('all');

  const { data, isLoading } = useQuery<Booking[]>({
    queryKey: ['bookings-admin', tab],
    queryFn: () => {
      const params = tab === 'all' ? '' : `?status=${tab}`;
      return api.get(`/bookings${params}`).then(r => r.data?.data ?? []);
    },
  });

  const columns = [
    { key: 'id', label: 'ID', render: (r: Booking) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
    { key: 'type', label: 'Type', render: (r: Booking) => <StatusBadge status={r.type} /> },
    { key: 'mode', label: 'Mode', render: (r: Booking) => <StatusBadge status={r.mode} /> },
    { key: 'status', label: 'Status', render: (r: Booking) => <StatusBadge status={r.status} /> },
    { key: 'total_amount', label: 'Amount', render: (r: Booking) => `$${r.total_amount}` },
    { key: 'start_time', label: 'Start', render: (r: Booking) => new Date(r.start_time).toLocaleString() },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Bookings</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
            style={tab === t ? { backgroundColor: '#c9a84c' } : {}}>
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <DataTable columns={columns} data={data ?? []} loading={isLoading} />
      </div>
    </div>
  );
}
