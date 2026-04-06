import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { LayoutDashboard, Users, Car, CalendarCheck, CreditCard, LogOut } from 'lucide-react';

const nav = [
  { to: '/admin/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/vehicles', label: 'Vehicles', icon: Car },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
];

export default function Layout() {
  const { admin, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/admin/login'); };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col" style={{ backgroundColor: '#1a1a2e' }}>
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-bold" style={{ color: '#c9a84c' }}>VIP Mobility</h1>
          <p className="text-xs text-gray-400 mt-1">Admin Dashboard</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
              style={({ isActive }) => isActive ? { backgroundColor: '#c9a84c22', color: '#c9a84c' } : {}}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: '#c9a84c' }}>
              {admin?.first_name?.[0] ?? 'A'}
            </div>
            <div>
              <p className="text-white text-sm font-medium">{admin?.first_name} {admin?.last_name}</p>
              <p className="text-gray-400 text-xs">{admin?.email}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors w-full px-2 py-1">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
