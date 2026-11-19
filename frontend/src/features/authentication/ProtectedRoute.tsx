import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../platform/auth/auth-context';

interface ProtectedRouteProps {
  children: React.ReactElement;
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false }) => {
  const { status, isAuthenticated, isAdmin, loading, message, refresh } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (status === 'unavailable') {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-center max-w-md">
      <h1 className="text-2xl font-semibold text-gray-900 mb-3">Authentication is unavailable</h1>
      <p className="text-gray-600 mb-5">{message || 'We could not reach the account service. Your session state has not been changed.'}</p>
      <button className="px-4 py-2 rounded bg-[#3e555c] text-white" onClick={() => void refresh()}>Try again</button>
    </div></div>;
  }

  if (status === 'disabled') {
    return <div className="flex items-center justify-center min-h-screen" data-auth-state="disabled"><div className="text-center max-w-md">
      <h1 className="text-2xl font-semibold text-gray-900 mb-3">Authentication is disabled</h1>
      <p className="text-gray-600">Stellina is not accepting sign-ins right now. Protected pages are unavailable.</p>
    </div></div>;
  }

  if (status === 'forbidden') {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-center">
      <h1 className="text-3xl font-bold text-red-600 mb-4">Access Denied</h1>
      <p className="text-gray-600">This account is signed in but is not admitted to Stellina.</p>
    </div></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
