import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { CalendarCheck, Car, User, DollarSign, Clock, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const STATUSES = ['', 'pending', 'confirmed', 'active', 'completed', 'cancelled'];

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock size={14} />,
  confirmed: <CalendarCheck size={14} />,
  active: <CheckCircle size={14} />,
  completed: <CheckCircle size={14} />,
  cancelled: <XCircle size={14} />,
};

export default function OwnerBookingsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [completeModal, setCompleteModal] = useState<{ id: string; make: string } | null>(null);
  const [extraKm, setExtraKm] = useState('0');
  const [cancelModal, setCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['owner-bookings', status, page],
    queryFn: () =>
      api.get(`/bookings/owner-vehicles?page=${page}&limit=10${status ? `&status=${status}` : ''}`)
        .then(r => r.data.data),
    keepPreviousData: true,
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, extra_km }: { id: string; extra_km: number }) =>
      api.patch(`/bookings/${id}/complete`, { extra_km }),
    onSuccess: () => {
      setCompleteModal(null);
      qc.invalidateQueries({ queryKey: ['owner-bookings'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/bookings/${id}/cancel`, { cancellation_reason: reason }),
    onSuccess: () => {
      setCancelModal(null);
      setCancelReason('');
      qc.invalidateQueries({ queryKey: ['owner-bookings'] });
    },
  });

  const bookings = data?.bookings ?? [];
  const pagination = data?.pagination;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Bookings</h1>
          <p className="text-gray-500 mt-1">
            {pagination?.total ?? 0} booking{pagination?.total !== 1 ? 's' : ''} across your fleet
          </p>
        </div>
        <Link to="/owner" className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1">
          <ChevronLeft size={15} /> Dashboard
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {STATUSES.map(s => (
          <button key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              status === s
                ? 'text-white border-transparent'
                : 'border-gray-200 text-gray-600 hover:border-gray-400 bg-white'
            }`}
            style={status === s ? { background: '#1a1a2e' } : undefined}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-6 animate-pulse h-24" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="card p-16 text-center">
          <CalendarCheck size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">No bookings found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b: any) => (
            <div key={b.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
                    🚗
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900">
                        {b.vehicle?.make} {b.vehicle?.model}
                      </h3>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[b.status] ?? ''}`}>
                        {STATUS_ICON[b.status]} {b.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <User size={13} />
                        {b.customer?.first_name} {b.customer?.last_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={13} />
                        {new Date(b.start_time).toLocaleDateString()} → {new Date(b.end_time).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign size={13} />
                        ${b.total_amount}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 font-mono">#{b.id.slice(0, 8)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  {b.status === 'active' && (
                    <button
                      onClick={() => setCompleteModal({ id: b.id, make: `${b.vehicle?.make} ${b.vehicle?.model}` })}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors">
                      <CheckCircle size={14} /> Complete
                    </button>
                  )}
                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <button
                      onClick={() => setCancelModal(b.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors">
                      <XCircle size={14} /> Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-xl border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-600">Page {page} of {pagination.pages}</span>
          <button
            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            className="p-2 rounded-xl border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Complete Modal */}
      {completeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-8 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Complete Booking</h3>
            <p className="text-gray-500 text-sm mb-5">{completeModal.make}</p>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Extra KM driven (over limit)</label>
            <input className="input mb-6" type="number" min={0} max={10000}
              value={extraKm} onChange={e => setExtraKm(e.target.value)} />
            {extraKm && Number(extraKm) > 0 && (
              <p className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg mb-4">
                Overage charge: <strong>${(Number(extraKm) * 2).toFixed(2)}</strong> (${2}/km)
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setCompleteModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => completeMutation.mutate({ id: completeModal.id, extra_km: parseInt(extraKm) || 0 })}
                disabled={completeMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60">
                {completeMutation.isPending ? 'Completing…' : 'Mark Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-8 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Cancel Booking</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason *</label>
            <textarea className="input resize-none mb-6" rows={3}
              placeholder="Reason for cancellation…"
              value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => { setCancelModal(null); setCancelReason(''); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
                Back
              </button>
              <button
                disabled={!cancelReason.trim() || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate({ id: cancelModal, reason: cancelReason })}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60">
                {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
