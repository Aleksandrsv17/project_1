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

function Protected({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/vehicles" element={<VehiclesPage />} />
            <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
            <Route path="/book/:vehicleId" element={<Protected><BookingPage /></Protected>} />
            <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
            <Route path="/bookings/:id" element={<Protected><BookingDetailPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
