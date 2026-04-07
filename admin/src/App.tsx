import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import MapProvider from './components/MapProvider';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LiveMapPage from './pages/LiveMapPage';
import VehicleMapPage from './pages/VehicleMapPage';
import BookingMapPage from './pages/BookingMapPage';
import UsersPage from './pages/UsersPage';
import VehiclesPage from './pages/VehiclesPage';
import BookingsPage from './pages/BookingsPage';
import PaymentsPage from './pages/PaymentsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function App() {
  return (
    <MapProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/*" element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="live-map" element={<LiveMapPage />} />
            <Route path="vehicle-map" element={<VehicleMapPage />} />
            <Route path="booking-map" element={<BookingMapPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="vehicles" element={<VehiclesPage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="login" element={<Navigate to="/admin/" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin/" replace />} />
        </Routes>
      </BrowserRouter>
    </MapProvider>
  );
}
