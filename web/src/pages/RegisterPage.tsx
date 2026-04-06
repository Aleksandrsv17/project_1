import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Car } from 'lucide-react';

export default function RegisterPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    password: '', role: params.get('role') || 'customer',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 py-12 px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: '#1a1a2e' }}>
            <Car size={26} style={{ color: '#c9a84c' }} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Create your account</h1>
          <p className="text-gray-500 mt-1">Join VIP Mobility today</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name</label>
                <input className="input" placeholder="Alex" value={form.first_name} onChange={set('first_name')} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name</label>
                <input className="input" placeholder="Smith" value={form.last_name} onChange={set('last_name')} required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input className="input" type="tel" placeholder="+1 555 000 0000" value={form.phone} onChange={set('phone')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input className="input" type="password" placeholder="Min. 8 characters" value={form.password} onChange={set('password')} required minLength={8} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">I want to…</label>
              <select className="input" value={form.role} onChange={set('role')}>
                <option value="customer">Book luxury cars (Customer)</option>
                <option value="owner">List my luxury car (Owner)</option>
              </select>
            </div>
            {error && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60 mt-2">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account? <Link to="/login" className="text-vip-gold font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
