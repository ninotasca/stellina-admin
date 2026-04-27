import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LoginAttempts from './pages/LoginAttempts';
import RFPList from './pages/RFPList';
import RFPForm from './pages/RFPForm';
import HotelInvitations from './pages/HotelInvitations';
import HotelResponseForm from './pages/HotelResponseForm';
import ResponseComparison from './pages/ResponseComparison';
import CommissionList from './pages/CommissionList';
import CommissionForm from './pages/CommissionForm';
import CommissionProjections from './pages/CommissionProjections';
import CommissionDashboard from './pages/CommissionDashboard';
import NimblePage from './pages/NimblePage';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requireAdmin={true}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/login-attempts"
            element={
              <ProtectedRoute requireAdmin={true}>
                <LoginAttempts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rfps"
            element={
              <ProtectedRoute requireAdmin={true}>
                <RFPList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rfps/new"
            element={
              <ProtectedRoute requireAdmin={true}>
                <RFPForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rfps/:id/edit"
            element={
              <ProtectedRoute requireAdmin={true}>
                <RFPForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rfps/:rfpId/invitations"
            element={
              <ProtectedRoute requireAdmin={true}>
                <HotelInvitations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rfps/:rfpId/responses"
            element={
              <ProtectedRoute requireAdmin={true}>
                <ResponseComparison />
              </ProtectedRoute>
            }
          />
          <Route
            path="/commissions"
            element={
              <ProtectedRoute requireAdmin={true}>
                <CommissionDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/commissions/list"
            element={
              <ProtectedRoute requireAdmin={true}>
                <CommissionList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/commissions/new"
            element={
              <ProtectedRoute requireAdmin={true}>
                <CommissionForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/commissions/:id/edit"
            element={
              <ProtectedRoute requireAdmin={true}>
                <CommissionForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/commissions/projections"
            element={
              <ProtectedRoute requireAdmin={true}>
                <CommissionProjections />
              </ProtectedRoute>
            }
          />
          <Route
            path="/nimble"
            element={
              <ProtectedRoute requireAdmin={true}>
                <NimblePage />
              </ProtectedRoute>
            }
          />
          <Route path="/hotel-response/:guid" element={<HotelResponseForm />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
