import { Car } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-vip-dark text-gray-400 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Car size={20} style={{ color: '#c9a84c' }} />
              <span className="text-white font-bold">VIP Mobility</span>
            </div>
            <p className="text-sm leading-relaxed">Luxury mobility marketplace — ride-hailing, rentals & chauffeur services.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Services</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/vehicles?mode=chauffeur" className="hover:text-white transition-colors">Chauffeur Rides</Link></li>
              <li><Link to="/vehicles?mode=self_drive" className="hover:text-white transition-colors">Self-Drive Rental</Link></li>
              <li><Link to="/vehicles" className="hover:text-white transition-colors">Browse Fleet</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">List Your Car</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 text-center text-xs">
          © {new Date().getFullYear()} VIP Mobility. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
