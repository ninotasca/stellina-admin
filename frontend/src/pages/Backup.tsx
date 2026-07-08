import React, { useState } from 'react';
import { apiClient } from '../services/api';

const Backup: React.FC = () => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDownloadedAt, setLastDownloadedAt] = useState<string | null>(null);

  const downloadBackup = async () => {
    setDownloading(true);
    setError(null);
    try {
      const blob = await apiClient.downloadSqliteBackup();
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stellina-backup-${stamp}.sqlite`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setLastDownloadedAt(now.toLocaleString());
    } catch (err: any) {
      setError(err.response?.data?.detail || 'The backup could not be created. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Admin</p>
        <h1 className="text-3xl font-bold text-gray-900 mt-1">Database Backup</h1>
        <p className="text-gray-600 mt-3 max-w-2xl">
          Download a single SQLite file with the Stellina database tables, so you can keep a local copy on this laptop or an external drive.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Stellina backup file</h2>
            <p className="text-sm text-gray-600 mt-2">
              The file includes bookings, commission line items, notes, RFP data, site selection forms, Cvent tracker data, and user access records.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              This is a table backup. Uploaded files stored separately in Supabase Storage are not embedded in this file.
            </p>
            {lastDownloadedAt && (
              <p className="text-sm text-green-700 mt-4">Last downloaded in this browser session: {lastDownloadedAt}</p>
            )}
          </div>
          <button
            onClick={downloadBackup}
            disabled={downloading}
            className="px-5 py-3 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {downloading ? 'Creating backup...' : 'Download Backup'}
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-lg p-5">
        <h3 className="font-semibold text-blue-950">How to store it safely</h3>
        <p className="text-sm text-blue-900 mt-2">
          Keep the newest backup somewhere easy to find, and consider copying it to iCloud Drive, Dropbox, or an external drive. Treat it like business data, because it may contain client and event details.
        </p>
      </div>
    </div>
  );
};

export default Backup;
