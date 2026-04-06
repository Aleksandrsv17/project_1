import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { MapPin, Clock, Car, ChevronLeft, AlertCircle } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800', completed: 'bg-gray-100 text-gray-700', cancelled: 'bg-red-100 text-red-800',
};

export default function BookingDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get(`/bookings/${id}`).then(r => r.data?.data),
  });

  const cancel = useMutation({
    mutationFn: () => api.patch(`/bookings/${id}/status`, { status: 'cancelled' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking', id] }),
  });

  if (isLoading) return <div className="flex justify-center py-32"><div className="animate-spin w-10 h-10 border-4 border-gray-200 rounded-full" style={{ borderTopColor: '#c9a84c' }} /></div>;
  if (!booking) return <div className="text-center py-32 text-gray-500">Booking not found</div>;

  const canCancel = ['pending', 'confirmed'].includes(booking.status);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/dashboard" className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm mb-6 transition-colors">
          <ChevronLeft size={16} /> Back to Dashboard
        </Link>

        <div className="card p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900">Booking Details</h1>
              <p className="text-gray-400 text-sm mt-0.5 font-mono">{booking.id}</p>
            </div>
            <span className={`text-sm font-semibold px-3 py-1.5 rounded-full capitalize ${STATUS_BADGE[booking.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {booking.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-5 mb-6">
            {[
              { icon: Car,   label: 'Type',     value: booking.type?.replace(/_/g, ' ') },
              { icon: Car,   label: 'Mode',     value: booking.mode?.replace(/_/g, ' ') },
              { icon: Clock, label: 'Start',    value: new Date(booking.start_time).toLocaleString() },
              { icon: Clock, label: 'End',      value: booking.end_time ? new Date(booking.end_time).toLocaleString() : '—' },
              { icon: MapPin,label: 'Pickup',   value: booking.pickup_address || '—' },
              { icon: MapPin,label: 'Drop-off', value: booking.dropoff_address || '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                  <Icon size={12} /><span className="uppercase tracking-wide font-medium">{label}</span>
                </div>
                <p className="text-gray-900 font-semibold text-sm capitalize">{value}</p>
              </div>
            ))}
          </div>

          {/* Price breakdown */}
          <div className="border-t pt-5 mb-6">
            <h3 className="font-bold text-gray-900 mb-3">Price Breakdown</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600"><span>Base amount</span><span>${booking.base_amount}</span></div>
              {parseFloat(booking.chauffeur_fee) > 0 && <div className="flex justify-between text-gray-600"><span>Chauffeur fee</span><span>${booking.chauffeur_fee}</span></div>}
              <div className="flex justify-between text-gray-600"><span>Insurance</span><span>${booking.insurance_fee}</span></div>
              <div className="flex justify-between text-gray-600"><span>Platform fee</span><span>${booking.platform_commission}</span></div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-2"><span>Total</span><span>${booking.total_amount}</span></div>
            </div>
          </div>

          {/* Actions */}
          {canCancel && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Cancel Booking</p>
                <p className="text-xs text-red-600 mt-0.5">Cancellation 48h+ before start: full refund. Less than 48h: partial or no refund.</p>
              </div>
              <button onClick={() => { if (confirm('Cancel this booking?')) cancel.mutate(); }}
                disabled={cancel.isPending}
                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
                {cancel.isPending ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
