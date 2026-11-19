import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell, Backup, Dashboard, LoginAttempts } from '../features/administration';
import { Login, ProtectedRoute } from '../features/authentication';
import {
  CommissionDashboard, CommissionForm, CommissionList, CommissionProjections,
  CommissionView, HotelComparisons, InvoiceTracker, PointsTracker,
} from '../features/commissions';
import { CventMergePage, CventUploadView, HotelComparisonSummaryPage } from '../features/cvent';
import { NimblePage } from '../features/nimble';
import { HotelInvitations, HotelResponseForm, RFPForm, RFPList, RFPPreview, ResponseComparison } from '../features/rfp';
import { PublicSiteSelectionForm, SiteSelectionFormBuilder, SiteSelectionList, SiteSelectionResponses } from '../features/site-selection';

export function ApplicationRoutes() {
  const adminShell = (
    <ProtectedRoute requireAdmin={true}>
      <AppShell />
    </ProtectedRoute>
  );

  return (
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
            <Route path="/invoices" element={<InvoiceTracker />} />
            <Route path="/points" element={<PointsTracker />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
  );
}

