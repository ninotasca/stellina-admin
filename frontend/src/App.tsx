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
import RFPPreview from './pages/RFPPreview';
import ResponseComparison from './pages/ResponseComparison';
import SiteSelectionFormBuilder from './pages/SiteSelectionFormBuilder';
import SiteSelectionList from './pages/SiteSelectionList';
import PublicSiteSelectionForm from './pages/PublicSiteSelectionForm';
import SiteSelectionResponses from './pages/SiteSelectionResponses';
import CommissionList from './pages/CommissionList';
import CommissionForm from './pages/CommissionForm';
import CommissionProjections from './pages/CommissionProjections';
import CommissionDashboard from './pages/CommissionDashboard';
import CommissionView from './pages/CommissionView';
import CventUploadView from './pages/CventUploadView';
import CventMergePage from './pages/CventMergePage';
import NimblePage from './pages/NimblePage';
import PointsTracker from './pages/PointsTracker';
import Backup from './pages/Backup';
import HotelComparisonSummaryPage from './pages/HotelComparisonSummaryPage';
import HotelComparisons from './pages/HotelComparisons';

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
          <Route path="/site-selection/:guid" element={<PublicSiteSelectionForm />} />

          {/* Admin-only but renders the Partner Portal shell, not the admin nav */}
          <Route
            path="/rfps/:rfpId/preview"
            element={
              <ProtectedRoute requireAdmin={true}>
                <RFPPreview />
              </ProtectedRoute>
            }
          />

          {/* Full-screen Hotel Comparison Summary spreadsheet viewer */}
          <Route
            path="/commissions/:id/cvent/:uploadId"
            element={
              <ProtectedRoute requireAdmin={true}>
                <CventUploadView />
              </ProtectedRoute>
            }
          />

          {/* Hotel Comparison Summary re-upload merge / conflict resolution */}
          <Route
            path="/commissions/:id/cvent-merge/:mergeJobId"
            element={
              <ProtectedRoute requireAdmin={true}>
                <CventMergePage />
              </ProtectedRoute>
            }
          />

          {/* All admin pages share the AppShell chrome (top nav + settings menu) */}
          <Route element={adminShell}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/login-attempts" element={<LoginAttempts />} />

            <Route path="/rfps" element={<RFPList />} />
            <Route path="/commissions/:eventId/rfps/new" element={<RFPForm />} />
            <Route path="/rfps/:id/edit" element={<RFPForm />} />
            <Route path="/rfps/:rfpId/invitations" element={<HotelInvitations />} />
            <Route path="/rfps/:rfpId/responses" element={<ResponseComparison />} />

            <Route path="/site-selection" element={<SiteSelectionList />} />
            <Route path="/commissions/:eventId/site-selection/new" element={<SiteSelectionFormBuilder />} />
            <Route path="/site-selection/:id/edit" element={<SiteSelectionFormBuilder />} />
            <Route path="/site-selection/:id/responses" element={<SiteSelectionResponses />} />

            <Route path="/hotel-comparisons" element={<HotelComparisons />} />
            <Route path="/commissions" element={<CommissionDashboard />} />
            <Route path="/commissions/list" element={<CommissionList />} />
            <Route path="/commissions/new" element={<CommissionForm />} />
            <Route path="/commissions/:id/hotel-comparison" element={<HotelComparisonSummaryPage />} />
            <Route path="/commissions/:id/edit" element={<CommissionForm />} />
            <Route path="/commissions/:id" element={<CommissionView />} />
            <Route path="/commissions/projections" element={<CommissionProjections />} />

            <Route path="/nimble" element={<NimblePage />} />
            <Route path="/backup" element={<Backup />} />
            <Route path="/points" element={<PointsTracker />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
