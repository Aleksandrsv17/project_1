import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Car } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      setError('Invalid email or password');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 py-12 px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: '#1a1a2e' }}>
            <Car size={26} style={{ color: '#c9a84c' }} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Welcome back</h1>
          <p className="text-gray-500 mt-1">Sign in to your VIP account</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input className="input" type="password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">
            Don't have an account? <Link to="/register" className="text-vip-gold font-semibold hover:underline">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
