import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
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
import CommissionView from './pages/CommissionView';
import NimblePage from './pages/NimblePage';

function App() {
  const adminShell = (
    <ProtectedRoute requireAdmin={true}>
      <AppShell />
    </ProtectedRoute>
  );

  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<Login />} />
          <Route path="/hotel-response/:guid" element={<HotelResponseForm />} />

          {/* All admin pages share the AppShell chrome (top nav + settings menu) */}
          <Route element={adminShell}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/login-attempts" element={<LoginAttempts />} />

            <Route path="/rfps" element={<RFPList />} />
            <Route path="/rfps/new" element={<RFPForm />} />
            <Route path="/rfps/:id/edit" element={<RFPForm />} />
            <Route path="/rfps/:rfpId/invitations" element={<HotelInvitations />} />
            <Route path="/rfps/:rfpId/responses" element={<ResponseComparison />} />

            <Route path="/commissions" element={<CommissionDashboard />} />
            <Route path="/commissions/list" element={<CommissionList />} />
            <Route path="/commissions/new" element={<CommissionForm />} />
            <Route path="/commissions/:id/edit" element={<CommissionForm />} />
            <Route path="/commissions/:id" element={<CommissionView />} />
            <Route path="/commissions/projections" element={<CommissionProjections />} />

            <Route path="/nimble" element={<NimblePage />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
