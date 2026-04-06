import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Car, LogOut, LayoutDashboard, Plus, List, CalendarCheck, ChevronDown, Menu, X } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isOwner = user?.role === 'owner' || user?.role === 'admin';
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="sticky top-0 z-50 bg-vip-dark shadow-lg">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <Car size={22} style={{ color: '#c9a84c' }} />
          <span className="text-white font-bold text-lg tracking-tight">
            VIP <span style={{ color: '#c9a84c' }}>Mobility</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link to="/vehicles"
            className={`text-sm font-medium transition-colors ${isActive('/vehicles') ? 'text-white' : 'text-gray-300 hover:text-white'}`}>
            Fleet
          </Link>
          <Link to="/#how-it-works"
            className="text-gray-300 hover:text-white text-sm font-medium transition-colors">
            How It Works
          </Link>
          <Link to="/#pricing"
            className="text-gray-300 hover:text-white text-sm font-medium transition-colors">
            Pricing
          </Link>

          {/* Owner dropdown */}
          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setOwnerOpen(o => !o)}
                onBlur={() => setTimeout(() => setOwnerOpen(false), 150)}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive('/owner') ? 'text-white' : 'text-gray-300 hover:text-white'}`}>
                My Fleet <ChevronDown size={14} className={`transition-transform ${ownerOpen ? 'rotate-180' : ''}`} />
              </button>

              {ownerOpen && (
                <div className="absolute top-full right-0 mt-2 w-52 rounded-2xl shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
                  <Link to="/owner" onClick={() => setOwnerOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <LayoutDashboard size={15} style={{ color: '#c9a84c' }} /> Dashboard
                  </Link>
                  <Link to="/owner/vehicles" onClick={() => setOwnerOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <List size={15} style={{ color: '#c9a84c' }} /> My Vehicles
                  </Link>
                  <Link to="/owner/vehicles/add" onClick={() => setOwnerOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <Plus size={15} style={{ color: '#c9a84c' }} /> Add Vehicle
                  </Link>
                  <Link to="/owner/bookings" onClick={() => setOwnerOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors">
                    <CalendarCheck size={15} style={{ color: '#c9a84c' }} /> Bookings
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: user actions */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              {!isOwner && (
                <Link to="/dashboard"
                  className="flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors">
                  <LayoutDashboard size={16} />
                  <span>{user.first_name}</span>
                </Link>
              )}
              {isOwner && (
                <Link to="/owner"
                  className="flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors">
                  <LayoutDashboard size={16} />
                  <span>{user.first_name}</span>
                </Link>
              )}
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
                title="Sign out">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-gray-300 hover:text-white text-sm font-medium transition-colors">
                Sign In
              </Link>
              <Link to="/register" className="btn-gold text-sm py-2 px-5">Get Started</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-gray-300 hover:text-white"
          onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-vip-dark border-t border-white/10 px-6 py-4 space-y-3">
          <Link to="/vehicles" onClick={() => setMobileOpen(false)}
            className="block text-gray-300 hover:text-white text-sm font-medium py-2">Fleet</Link>

          {isOwner && (
            <>
              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Owner</p>
                <Link to="/owner" onClick={() => setMobileOpen(false)}
                  className="block text-gray-300 hover:text-white text-sm py-2">Dashboard</Link>
                <Link to="/owner/vehicles" onClick={() => setMobileOpen(false)}
                  className="block text-gray-300 hover:text-white text-sm py-2">My Vehicles</Link>
                <Link to="/owner/vehicles/add" onClick={() => setMobileOpen(false)}
                  className="block text-gray-300 hover:text-white text-sm py-2">Add Vehicle</Link>
                <Link to="/owner/bookings" onClick={() => setMobileOpen(false)}
                  className="block text-gray-300 hover:text-white text-sm py-2">Bookings</Link>
              </div>
            </>
          )}

          {user ? (
            <div className="border-t border-white/10 pt-3">
              <button
                onClick={() => { logout(); navigate('/'); setMobileOpen(false); }}
                className="flex items-center gap-2 text-gray-400 hover:text-white text-sm py-2">
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          ) : (
            <div className="border-t border-white/10 pt-3 space-y-2">
              <Link to="/login" onClick={() => setMobileOpen(false)}
                className="block text-gray-300 hover:text-white text-sm py-2">Sign In</Link>
              <Link to="/register" onClick={() => setMobileOpen(false)}
                className="btn-gold text-sm py-2 px-5 inline-block">Get Started</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
