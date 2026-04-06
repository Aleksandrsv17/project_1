import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VehiclesPage from './pages/VehiclesPage';
import VehicleDetailPage from './pages/VehicleDetailPage';
import BookingPage from './pages/BookingPage';
import DashboardPage from './pages/DashboardPage';
import BookingDetailPage from './pages/BookingDetailPage';
import OwnerDashboardPage from './pages/owner/OwnerDashboardPage';
import MyVehiclesPage from './pages/owner/MyVehiclesPage';
import AddVehiclePage from './pages/owner/AddVehiclePage';
import EditVehiclePage from './pages/owner/EditVehiclePage';
import OwnerBookingsPage from './pages/owner/OwnerBookingsPage';

function Protected({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function OwnerProtected({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role !== 'owner' && user?.role !== 'admin') return <Navigate to="/vehicles" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/vehicles" element={<VehiclesPage />} />
            <Route path="/vehicles/:id" element={<VehicleDetailPage />} />

            {/* Customer */}
            <Route path="/book/:vehicleId" element={<Protected><BookingPage /></Protected>} />
            <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
            <Route path="/bookings/:id" element={<Protected><BookingDetailPage /></Protected>} />

            {/* Owner */}
            <Route path="/owner" element={<OwnerProtected><OwnerDashboardPage /></OwnerProtected>} />
            <Route path="/owner/vehicles" element={<OwnerProtected><MyVehiclesPage /></OwnerProtected>} />
            <Route path="/owner/vehicles/add" element={<OwnerProtected><AddVehiclePage /></OwnerProtected>} />
            <Route path="/owner/vehicles/:id/edit" element={<OwnerProtected><EditVehiclePage /></OwnerProtected>} />
            <Route path="/owner/bookings" element={<OwnerProtected><OwnerBookingsPage /></OwnerProtected>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
