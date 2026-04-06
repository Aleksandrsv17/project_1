import { Link } from 'react-router-dom';
import { Shield, Clock, Star, ChevronRight, Car, MapPin, CreditCard } from 'lucide-react';

const features = [
  { icon: Car,       title: 'Luxury Fleet',      desc: 'Rolls-Royce, Bentley, Mercedes S-Class and more — all verified.' },
  { icon: Clock,     title: 'Instant or Scheduled', desc: 'Book now or plan ahead. Available 24/7 for any occasion.' },
  { icon: Shield,    title: 'Fully Insured',      desc: 'Every booking includes insurance. KYC-verified drivers only.' },
  { icon: Star,      title: 'Chauffeur Option',   desc: 'Add a professional driver or take the wheel yourself.' },
  { icon: MapPin,    title: 'GPS Tracking',       desc: 'Real-time tracking for every trip. Full transparency.' },
  { icon: CreditCard,title: 'Secure Payments',   desc: 'Stripe-powered payments. Deposits released automatically.' },
];

const steps = [
  { n: '01', title: 'Browse the Fleet', desc: 'Filter by category, price, city, and chauffeur availability.' },
  { n: '02', title: 'Choose Your Style', desc: 'Self-drive or with a professional chauffeur — your call.' },
  { n: '03', title: 'Book & Pay Securely', desc: 'Confirm your booking in minutes. Stripe handles the rest.' },
  { n: '04', title: 'Enjoy the Ride', desc: 'Track your driver live. Rate your experience after.' },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)' }}>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #c9a84c 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="max-w-7xl mx-auto px-6 py-24 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-vip-gold/20 border border-vip-gold/30 rounded-full px-4 py-2 mb-6">
              <Star size={14} className="text-vip-gold" fill="#c9a84c" />
              <span className="text-vip-gold text-sm font-medium">Premium Luxury Experience</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight mb-6">
              Ride in Style.<br /><span style={{ color: '#c9a84c' }}>Drive in Luxury.</span>
            </h1>
            <p className="text-gray-300 text-xl leading-relaxed mb-10">
              Rent or ride in high-end cars — with or without a chauffeur — anytime, anywhere. The VIP experience you deserve.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/vehicles" className="btn-gold flex items-center gap-2 text-base">
                Browse Fleet <ChevronRight size={18} />
              </Link>
              <Link to="/register?role=owner" className="btn-outline text-base">
                List Your Car
              </Link>
            </div>

            {/* Stats */}
            <div className="flex gap-10 mt-14">
              {[['500+', 'Luxury Vehicles'], ['10k+', 'Happy Riders'], ['4.9★', 'Average Rating']].map(([val, label]) => (
                <div key={label}>
                  <p className="text-3xl font-bold text-white">{val}</p>
                  <p className="text-gray-400 text-sm">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Floating car card */}
        <div className="hidden lg:block absolute right-16 top-1/2 -translate-y-1/2">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 w-72 shadow-2xl">
            <div className="text-5xl text-center mb-3">🚗</div>
            <p className="text-white font-bold text-center">2024 Rolls-Royce Ghost</p>
            <p className="text-gray-400 text-sm text-center mb-4">Business Class · Chauffeur Available</p>
            <div className="flex justify-between items-center bg-white/10 rounded-xl p-3">
              <div><p className="text-gray-400 text-xs">From</p><p className="text-white font-bold text-lg">$850<span className="text-sm font-normal">/day</span></p></div>
              <span className="bg-vip-gold text-white text-xs font-bold px-3 py-1.5 rounded-lg">Book Now</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-vip-dark mb-4">Everything You Need</h2>
            <p className="text-gray-500 text-lg">A complete luxury mobility experience from booking to drop-off.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl border border-gray-100 hover:border-vip-gold/30 hover:shadow-md transition-all">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: '#c9a84c20' }}>
                  <Icon size={22} style={{ color: '#c9a84c' }} />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24" style={{ background: '#f8f7f4' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-vip-dark mb-4">How It Works</h2>
            <p className="text-gray-500 text-lg">Book your luxury experience in 4 simple steps.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map(({ n, title, desc }) => (
              <div key={n} className="text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-extrabold text-white"
                  style={{ background: 'linear-gradient(135deg, #1a1a2e, #c9a84c)' }}>{n}</div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24" style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f3460)' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-extrabold text-white mb-4">Ready to Experience Luxury?</h2>
          <p className="text-gray-300 text-lg mb-10">Join thousands of VIP clients who trust us for every journey.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/register" className="btn-gold text-base">Create Free Account</Link>
            <Link to="/vehicles" className="btn-outline text-base">Browse Fleet</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
