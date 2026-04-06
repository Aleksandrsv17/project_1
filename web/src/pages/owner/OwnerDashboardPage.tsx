import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import {
  Car, CalendarCheck, DollarSign, Clock,
  Plus, ChevronRight, TrendingUp, AlertCircle,
} from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function OwnerDashboardPage() {
  const { user } = useAuthStore();

  const { data: vehiclesData } = useQuery({
    queryKey: ['owner-vehicles'],
    queryFn: () => api.get('/vehicles/owner/my-vehicles').then(r => r.data.data),
  });

  const { data: bookingsData } = useQuery({
    queryKey: ['owner-bookings', 'dashboard'],
    queryFn: () => api.get('/bookings/owner-vehicles?limit=5').then(r => r.data.data),
  });

  const vehicles = vehiclesData?.vehicles ?? [];
  const recentBookings = bookingsData?.bookings ?? [];
  const bookingTotal = bookingsData?.pagination?.total ?? 0;

  const activeVehicles = vehicles.filter((v: any) => v.status === 'active').length;
  const pendingBookings = recentBookings.filter((b: any) => b.status === 'pending').length;
  const totalEarnings = recentBookings
    .filter((b: any) => b.status === 'completed')
    .reduce((sum: number, b: any) => sum + Number(b.total_amount ?? 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">
            Welcome back, <span style={{ color: '#c9a84c' }}>{user?.first_name}</span>
          </h1>
          <p className="text-gray-500 mt-1">Manage your fleet and bookings</p>
        </div>
        <Link to="/owner/vehicles/add" className="btn-gold flex items-center gap-2">
          <Plus size={16} /> List a Vehicle
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
        {[
          { label: 'Total Vehicles', value: vehicles.length, icon: Car, color: '#c9a84c' },
          { label: 'Active Listings', value: activeVehicles, icon: TrendingUp, color: '#22c55e' },
          { label: 'Total Bookings', value: bookingTotal, icon: CalendarCheck, color: '#3b82f6' },
          { label: 'Pending Requests', value: pendingBookings, icon: Clock, color: '#f59e0b' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">{label}</span>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                <Icon size={18} style={{ color }} />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* My Fleet */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">My Fleet</h2>
            <Link to="/owner/vehicles" className="text-sm font-medium flex items-center gap-1" style={{ color: '#c9a84c' }}>
              View all <ChevronRight size={14} />
            </Link>
          </div>
          {vehicles.length === 0 ? (
            <div className="text-center py-10">
              <Car size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 mb-4">No vehicles listed yet</p>
              <Link to="/owner/vehicles/add" className="btn-gold text-sm">Add Your First Car</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {vehicles.slice(0, 4).map((v: any) => (
                <Link key={v.id} to={`/owner/vehicles/${v.id}/edit`}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl">🚗</div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{v.make} {v.model} {v.year}</p>
                      <p className="text-xs text-gray-500">{v.location_city || 'No city'} · ${v.daily_rate}/day</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${v.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {v.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Bookings */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Recent Bookings</h2>
            <Link to="/owner/bookings" className="text-sm font-medium flex items-center gap-1" style={{ color: '#c9a84c' }}>
              View all <ChevronRight size={14} />
            </Link>
          </div>
          {recentBookings.length === 0 ? (
            <div className="text-center py-10">
              <CalendarCheck size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No bookings yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentBookings.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {b.vehicle?.make} {b.vehicle?.model}
                    </p>
                    <p className="text-xs text-gray-500">
                      {b.customer?.first_name} {b.customer?.last_name} · ${b.total_amount}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        {[
          { label: 'Add Vehicle', icon: Plus, to: '/owner/vehicles/add' },
          { label: 'My Fleet', icon: Car, to: '/owner/vehicles' },
          { label: 'All Bookings', icon: CalendarCheck, to: '/owner/bookings' },
        ].map(({ label, icon: Icon, to }) => (
          <Link key={to} to={to}
            className="card p-5 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center">
            <Icon size={22} style={{ color: '#c9a84c' }} />
            <span className="text-sm font-semibold text-gray-700">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
