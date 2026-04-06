import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/client';
import { CalendarCheck, Car, Clock, Star } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: bookings, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api.get('/bookings/my').then(r => r.data?.data ?? []),
  });

  const active = (bookings ?? []).filter((b: any) => ['pending','confirmed','active'].includes(b.status));
  const past = (bookings ?? []).filter((b: any) => ['completed','cancelled'].includes(b.status));

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Welcome back, {user?.first_name}!</h1>
          <p className="text-gray-500 mt-1">Manage your bookings and trips</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: CalendarCheck, label: 'Total Bookings', value: (bookings ?? []).length, color: '#6366f1' },
            { icon: Car,           label: 'Active',         value: active.length,               color: '#10b981' },
            { icon: Clock,         label: 'Completed',      value: past.filter((b: any) => b.status === 'completed').length, color: '#c9a84c' },
            { icon: Star,          label: 'Role',            value: user?.role,                  color: '#f59e0b' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 font-medium">{label}</span>
                <Icon size={16} style={{ color }} />
              </div>
              <p className="text-2xl font-bold text-gray-900 capitalize">{value ?? '—'}</p>
            </div>
          ))}
        </div>

        {/* Active bookings */}
        {active.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Active Bookings</h2>
            <div className="space-y-3">
              {active.map((b: any) => <BookingRow key={b.id} b={b} />)}
            </div>
          </div>
        )}

        {/* Past bookings */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Booking History</h2>
            <Link to="/vehicles" className="text-sm text-vip-gold font-semibold hover:underline">+ New Booking</Link>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-gray-200 rounded-full" style={{ borderTopColor: '#c9a84c' }} /></div>
          ) : past.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-4xl mb-3">🚗</p>
              <p className="text-gray-500">No past bookings yet</p>
              <Link to="/vehicles" className="btn-gold inline-flex mt-4 text-sm">Browse Fleet</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {past.map((b: any) => <BookingRow key={b.id} b={b} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BookingRow({ b }: { b: any }) {
  const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800', completed: 'bg-gray-100 text-gray-700', cancelled: 'bg-red-100 text-red-800',
  };
  return (
    <Link to={`/bookings/${b.id}`} className="card p-5 flex items-center justify-between hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: '#1a1a2e10' }}>🚗</div>
        <div>
          <p className="font-semibold text-gray-900 text-sm capitalize">{b.type?.replace('_', ' ')} · {b.mode?.replace('_', ' ')}</p>
          <p className="text-gray-400 text-xs mt-0.5">{new Date(b.start_time).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <p className="font-bold text-gray-900">${b.total_amount}</p>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-700'}`}>{b.status}</span>
      </div>
    </Link>
  );
}
