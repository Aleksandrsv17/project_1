import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { Calendar, Clock, MapPin, Car, User } from 'lucide-react';

const MODES = [{ v: 'self_drive', l: 'Self-Drive', d: 'You drive the car' }, { v: 'chauffeur', l: 'With Chauffeur', d: 'Professional driver included' }];
const TYPES = [{ v: 'daily_rental', l: 'Daily Rental' }, { v: 'hourly_rental', l: 'Hourly Rental' }, { v: 'scheduled', l: 'Scheduled Ride' }];

export default function BookingPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('self_drive');
  const [type, setType] = useState('daily_rental');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState(1);
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');

  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => api.get(`/vehicles/${vehicleId}`).then(r => r.data?.data),
  });

  const createBooking = useMutation({
    mutationFn: (payload: any) => api.post('/bookings', payload).then(r => r.data?.data),
    onSuccess: (data) => navigate(`/bookings/${data.booking?.id}`),
  });

  if (!vehicle) return <div className="flex justify-center py-32"><div className="animate-spin w-10 h-10 border-4 border-gray-200 rounded-full" style={{ borderTopColor: '#c9a84c' }} /></div>;

  const rate = mode === 'chauffeur' && vehicle.chauffeur_daily_rate ? parseFloat(vehicle.chauffeur_daily_rate) : parseFloat(vehicle.daily_rate);
  const isHourly = type === 'hourly_rental';
  const hourlyRate = vehicle.hourly_rate ? parseFloat(vehicle.hourly_rate) : rate / 8;
  const base = isHourly ? hourlyRate * duration : rate * duration;
  const insurance = 25 * (isHourly ? Math.ceil(duration / 24) : duration);
  const commission = (base + insurance) * 0.2;
  const total = base + insurance + commission;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) return;
    const startISO = new Date(`${startDate}T${startTime}`).toISOString();
    createBooking.mutate({
      vehicle_id: vehicleId,
      type,
      mode,
      start_time: startISO,
      duration_hours: isHourly ? duration : duration * 24,
      pickup_address: pickup,
      dropoff_address: dropoff || pickup,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Book Your Vehicle</h1>
        <p className="text-gray-500 mb-8">{vehicle.year} {vehicle.make} {vehicle.model}</p>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">

              {/* Mode */}
              <div className="card p-6">
                <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Car size={18} /> Drive Mode</h2>
                <div className="grid grid-cols-2 gap-3">
                  {MODES.map(({ v, l, d }) => (
                    (!vehicle.chauffeur_available && v === 'chauffeur') ? null :
                    <button key={v} type="button" onClick={() => setMode(v)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${mode === v ? 'border-vip-gold' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className="font-semibold text-gray-900 text-sm">{l}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{d}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div className="card p-6">
                <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Clock size={18} /> Booking Type</h2>
                <div className="flex gap-2 flex-wrap">
                  {TYPES.map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setType(v)}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${type === v ? 'text-white border-vip-gold' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      style={type === v ? { background: '#c9a84c' } : {}}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Duration */}
              <div className="card p-6">
                <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Calendar size={18} /> Date & Duration</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
                    <input className="input" type="date" value={startDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setStartDate(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Time</label>
                    <input className="input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Duration ({isHourly ? 'hours' : 'days'})
                    </label>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setDuration(d => Math.max(1, d - 1))}
                        className="w-10 h-10 rounded-xl border-2 border-gray-200 font-bold text-gray-700 hover:border-vip-gold transition-colors">−</button>
                      <span className="text-2xl font-bold text-gray-900 w-12 text-center">{duration}</span>
                      <button type="button" onClick={() => setDuration(d => d + 1)}
                        className="w-10 h-10 rounded-xl border-2 border-gray-200 font-bold text-gray-700 hover:border-vip-gold transition-colors">+</button>
                      <span className="text-gray-400 text-sm">{isHourly ? 'hours' : 'days'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="card p-6">
                <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><MapPin size={18} /> Location</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Pickup Address</label>
                    <input className="input" placeholder="Enter pickup address" value={pickup} onChange={e => setPickup(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Drop-off Address <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input className="input" placeholder="Same as pickup if empty" value={dropoff} onChange={e => setDropoff(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div>
              <div className="card p-6 sticky top-24">
                <h2 className="font-bold text-gray-900 mb-5">Price Summary</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>{isHourly ? `$${hourlyRate.toFixed(0)}/hr × ${duration}h` : `$${rate.toFixed(0)}/day × ${duration}d`}</span>
                    <span>${base.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Insurance</span><span>${insurance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Platform fee (20%)</span><span>${commission.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between font-bold text-gray-900 text-base">
                    <span>Total</span><span>${total.toFixed(2)}</span>
                  </div>
                </div>

                <button type="submit" disabled={createBooking.isPending}
                  className="btn-gold w-full mt-6 disabled:opacity-60">
                  {createBooking.isPending ? 'Creating booking…' : 'Confirm Booking'}
                </button>
                {createBooking.isError && (
                  <p className="text-red-500 text-xs mt-2 text-center">Failed — please try again</p>
                )}
                <p className="text-xs text-gray-400 text-center mt-3">Payment processed securely via Stripe</p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
