import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Car, User, LogOut, LayoutDashboard } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-50 bg-vip-dark shadow-lg">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Car size={22} style={{ color: '#c9a84c' }} />
          <span className="text-white font-bold text-lg tracking-tight">VIP <span style={{ color: '#c9a84c' }}>Mobility</span></span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link to="/vehicles" className="text-gray-300 hover:text-white text-sm font-medium transition-colors">Fleet</Link>
          <Link to="/#how-it-works" className="text-gray-300 hover:text-white text-sm font-medium transition-colors">How It Works</Link>
          <Link to="/#pricing" className="text-gray-300 hover:text-white text-sm font-medium transition-colors">Pricing</Link>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to="/dashboard" className="flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors">
                <LayoutDashboard size={16} />
                <span className="hidden sm:inline">{user.first_name}</span>
              </Link>
              <button onClick={() => { logout(); navigate('/'); }}
                className="flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-gray-300 hover:text-white text-sm font-medium transition-colors">Sign In</Link>
              <Link to="/register" className="btn-gold text-sm py-2 px-5">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
