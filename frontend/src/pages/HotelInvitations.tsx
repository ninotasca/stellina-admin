import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rfpApi, hotelInvitationApi } from '../services/rfpApi';
import type { HotelInvitationCreate, HotelInvitationWithStats, RFP } from '../types/rfp';

const HotelInvitations: React.FC = () => {
  const { rfpId } = useParams<{ rfpId: string }>();
  const navigate = useNavigate();
  const [rfp, setRfp] = useState<RFP | null>(null);
  const [invitations, setInvitations] = useState<HotelInvitationWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [hotelName, setHotelName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  useEffect(() => {
    if (rfpId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfpId]);

  const loadData = async () => {
    if (!rfpId) return;
    
    try {
      setLoading(true);
      const [rfpData, invitationsData] = await Promise.all([
        rfpApi.getRFP(parseInt(rfpId)),
        hotelInvitationApi.getInvitations(parseInt(rfpId)),
      ]);
      setRfp(rfpData);
      setInvitations(invitationsData);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfpId) return;

    try {
      const invitation: HotelInvitationCreate = {
        hotel_name: hotelName,
        contact_name: contactName,
        contact_email: contactEmail,
      };

      await hotelInvitationApi.createInvitation(parseInt(rfpId), invitation);
      
      // Reset form
      setHotelName('');
      setContactName('');
      setContactEmail('');
      setShowAddForm(false);
      
      // Reload invitations
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create invitation');
    }
  };

  const copyInvitationLink = (guid: string) => {
    const link = `${window.location.origin}/hotel-response/${guid}`;
    navigator.clipboard.writeText(link);
    alert('Link copied to clipboard!');
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      not_started: 'bg-gray-200 text-gray-800',
      in_progress: 'bg-yellow-200 text-yellow-800',
      completed: 'bg-green-200 text-green-800',
    };

    const labels = {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      completed: 'Completed',
    };

    return (
      <span
        className={`px-2 py-1 text-xs font-semibold rounded-full ${
          styles[status as keyof typeof styles]
        }`}
      >
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!rfp) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center">RFP not found</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate('/rfps')}
          className="text-blue-600 hover:text-blue-800 mb-2"
        >
          ← Back to RFPs
        </button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Hotel Invitations</h1>
            <p className="text-gray-600 mt-1">
              {rfp.client_name} - {new Date(rfp.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - {new Date(rfp.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/rfps/${rfpId}/responses`)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              View Responses
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {showAddForm ? 'Cancel' : 'Add Hotel'}
            </button>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Add Hotel Invitation</h2>
          <form onSubmit={handleAddInvitation}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hotel Name *
                </label>
                <input
                  type="text"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name *
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email *
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Invitation
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hotel Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Views
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Activity
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invitations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No hotels invited yet. Click "Add Hotel" to create an invitation.
                </td>
              </tr>
            ) : (
              invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {invitation.hotel_name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{invitation.contact_name}</div>
                    <div className="text-xs text-gray-500">{invitation.contact_email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(invitation.response_status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{invitation.view_count} views</div>
                    {invitation.first_viewed_at && (
                      <div className="text-xs text-gray-500">
                        First: {new Date(invitation.first_viewed_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {invitation.completed_at
                        ? `Completed: ${new Date(invitation.completed_at).toLocaleDateString()}`
                        : invitation.last_updated_at
                        ? `Updated: ${new Date(invitation.last_updated_at).toLocaleDateString()}`
                        : 'No activity'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => copyInvitationLink(invitation.guid)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Copy Link
                    </button>
                    {invitation.response_status !== 'not_started' && (
                      <button
                        onClick={() =>
                          navigate(`/rfps/${rfpId}/responses/${invitation.id}`)
                        }
                        className="text-green-600 hover:text-green-900"
                      >
                        View Response
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HotelInvitations;
