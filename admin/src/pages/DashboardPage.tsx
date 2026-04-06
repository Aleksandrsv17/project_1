import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Car, CalendarCheck, DollarSign } from 'lucide-react';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { api } from '../api/client';

// Generate stable chart data (last 30 days) — deterministic based on date string
const chartData = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (29 - i));
  const dateStr = d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const hash = dateStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return { date: dateStr, bookings: (hash % 16) + 5 };
});

export default function DashboardPage() {
  const { data: bookings } = useQuery({
    queryKey: ['bookings-recent'],
    queryFn: () => api.get('/bookings?limit=10').then(r => r.data?.data ?? []),
  });

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">Platform overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Users" value="—" sub="All registered" icon={<Users size={20} />} color="#6366f1" />
        <StatCard label="Active Vehicles" value="—" sub="In marketplace" icon={<Car size={20} />} color="#c9a84c" />
        <StatCard label="Total Bookings" value="—" sub="All time" icon={<CalendarCheck size={20} />} color="#10b981" />
        <StatCard label="Revenue MTD" value="—" sub="Platform commission" icon={<DollarSign size={20} />} color="#f59e0b" />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-8">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Bookings — Last 30 Days</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="bookings" stroke="#c9a84c" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Bookings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Recent Bookings</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {(bookings ?? []).length === 0 ? (
            <p className="p-6 text-gray-400 text-sm">No bookings yet</p>
          ) : (bookings ?? []).map((b: Record<string, unknown>) => (
            <div key={String(b.id)} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{String(b.id).slice(0, 8)}…</p>
                <p className="text-xs text-gray-400">{String(b.type)} · {String(b.mode)}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-900">${String(b.total_amount)}</span>
                <StatusBadge status={String(b.status)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
