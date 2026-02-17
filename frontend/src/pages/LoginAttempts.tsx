import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import type { AllowedGoogleAccount, LoginAttempt } from '../types/api';

const LoginAttempts: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [allowedAccounts, setAllowedAccounts] = useState<AllowedGoogleAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowedLoading, setAllowedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowedError, setAllowedError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSuccess, setFilterSuccess] = useState<'all' | 'success' | 'failure'>('all');
  const [newEntryType, setNewEntryType] = useState<'email' | 'domain'>('email');
  const [newEntryValue, setNewEntryValue] = useState('');

  useEffect(() => {
    fetchLoginAttempts();
    fetchAllowedAccounts();
  }, []);

  const fetchLoginAttempts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getLoginAttempts(200, 0);
      setAttempts(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch login attempts');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllowedAccounts = async () => {
    setAllowedLoading(true);
    setAllowedError(null);
    try {
      const data = await apiClient.getAllowedGoogleAccounts();
      setAllowedAccounts(data);
    } catch (err: any) {
      setAllowedError(err.response?.data?.detail || 'Failed to fetch allowed Google accounts');
    } finally {
      setAllowedLoading(false);
    }
  };

  const handleAddAllowedAccount = async () => {
    if (!newEntryValue.trim()) {
      setAllowedError('Enter a valid email or domain.');
      return;
    }
    setAllowedError(null);
    try {
      const payload =
        newEntryType === 'email'
          ? { email: newEntryValue.trim() }
          : { domain: newEntryValue.trim().replace(/^@/, '') };
      const created = await apiClient.createAllowedGoogleAccount(payload);
      setAllowedAccounts((prev) => [...prev, created]);
      setNewEntryValue('');
    } catch (err: any) {
      setAllowedError(err.response?.data?.detail || 'Failed to add allowed account');
    }
  };

  const handleToggleAllowedAccount = async (account: AllowedGoogleAccount) => {
    try {
      const updated = await apiClient.updateAllowedGoogleAccount(account.id, {
        is_active: !account.is_active,
      });
      setAllowedAccounts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err: any) {
      setAllowedError(err.response?.data?.detail || 'Failed to update allowed account');
    }
  };

  const handleDeleteAllowedAccount = async (accountId: string) => {
    try {
      await apiClient.deleteAllowedGoogleAccount(accountId);
      setAllowedAccounts((prev) => prev.filter((item) => item.id !== accountId));
    } catch (err: any) {
      setAllowedError(err.response?.data?.detail || 'Failed to delete allowed account');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filteredAttempts = attempts.filter((attempt) => {
    const matchesSearch = !searchTerm || 
      (attempt.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (attempt.ip_address?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    
    const matchesFilter = filterSuccess === 'all' ||
      (filterSuccess === 'success' && attempt.success) ||
      (filterSuccess === 'failure' && !attempt.success);
    
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const userSummaries = Object.values(
    attempts.reduce<Record<string, {
      email: string;
      total: number;
      success: number;
      failure: number;
      lastAttempt: string;
    }>>((acc, attempt) => {
      if (!attempt.user_email) {
        return acc;
      }
      const key = attempt.user_email.toLowerCase();
      if (!acc[key]) {
        acc[key] = {
          email: attempt.user_email,
          total: 0,
          success: 0,
          failure: 0,
          lastAttempt: attempt.timestamp,
        };
      }
      acc[key].total += 1;
      if (attempt.success) {
        acc[key].success += 1;
      } else {
        acc[key].failure += 1;
      }
      if (new Date(attempt.timestamp) > new Date(acc[key].lastAttempt)) {
        acc[key].lastAttempt = attempt.timestamp;
      }
      return acc;
    }, {}),
  ).sort((a, b) => new Date(b.lastAttempt).getTime() - new Date(a.lastAttempt).getTime());

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-gray-600 hover:text-gray-900"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Access Control</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {user?.avatar_url && (
                  <img
                    src={user.avatar_url}
                    alt={user.full_name || user.email}
                    className="w-10 h-10 rounded-full border-2 border-blue-500"
                  />
                )}
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.full_name || user?.email}</p>
                  {user?.is_admin && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Admin
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Allowed Google Accounts */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Allowed Google Accounts</h2>
              <p className="text-sm text-gray-500">
                Manage who can sign in with Google. Add emails or domains.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAllowedAccounts}
                className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Entry type</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    checked={newEntryType === 'email'}
                    onChange={() => setNewEntryType('email')}
                    className="text-blue-600"
                  />
                  Email
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    checked={newEntryType === 'domain'}
                    onChange={() => setNewEntryType('domain')}
                    className="text-blue-600"
                  />
                  Domain
                </label>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {newEntryType === 'email' ? 'Email address' : 'Domain'}
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder={newEntryType === 'email' ? 'user@example.com' : 'example.com'}
                  value={newEntryValue}
                  onChange={(e) => setNewEntryValue(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleAddAllowedAccount}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {allowedError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {allowedError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email / Domain
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Added
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allowedLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-sm text-gray-500">
                      Loading allowed accounts...
                    </td>
                  </tr>
                ) : allowedAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-sm text-gray-500">
                      No allowed accounts configured.
                    </td>
                  </tr>
                ) : (
                  allowedAccounts.map((account) => (
                    <tr key={account.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {account.email || (account.domain ? `*@${account.domain}` : 'Unknown')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {account.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(account.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => handleToggleAllowedAccount(account)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {account.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => handleDeleteAllowedAccount(account.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Login History by User */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Login History by User</h2>
              <p className="text-sm text-gray-500">Summary of login activity per person.</p>
            </div>
          </div>
          {userSummaries.length === 0 ? (
            <p className="text-sm text-gray-500">No login history available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Success
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Failure
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Attempt
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userSummaries.map((summary) => (
                    <tr key={summary.email} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{summary.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{summary.total}</td>
                      <td className="px-6 py-4 text-sm text-green-700">{summary.success}</td>
                      <td className="px-6 py-4 text-sm text-red-700">{summary.failure}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(summary.lastAttempt)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <button
                          onClick={() => setSearchTerm(summary.email)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View history
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Search by email or IP address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Status
              </label>
              <select
                value={filterSuccess}
                onChange={(e) => setFilterSuccess(e.target.value as 'all' | 'success' | 'failure')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Attempts</option>
                <option value="success">Successful Only</option>
                <option value="failure">Failed Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-100 rounded-lg p-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Attempts</p>
                <p className="text-2xl font-bold text-gray-900">{attempts.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-100 rounded-lg p-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Successful</p>
                <p className="text-2xl font-bold text-green-900">
                  {attempts.filter(a => a.success).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-red-100 rounded-lg p-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Failed</p>
                <p className="text-2xl font-bold text-red-900">
                  {attempts.filter(a => !a.success).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchLoginAttempts}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : filteredAttempts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No login attempts found matching your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User Agent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAttempts.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(attempt.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {attempt.user_email || <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {attempt.success ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {attempt.ip_address || <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={attempt.user_agent || ''}>
                        {attempt.user_agent || <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-red-600 max-w-xs truncate" title={attempt.error_message || ''}>
                        {attempt.error_message || <span className="text-gray-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default LoginAttempts;
