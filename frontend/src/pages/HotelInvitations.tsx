import { getApiErrorMessage } from '../services/http';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rfpApi, hotelInvitationApi } from '../services/rfpApi';
import { commissionApi } from '../services/commissionApi';
import type { HotelInvitationWithStats, RFP } from '../types/rfp';
import type { CommissionEventWithLineItems, HotelConsidered } from '../types/commission';

import { parseLocalDate } from '../utils/date';

const fmtDate = (v?: string | null) =>
  v ? parseLocalDate(v).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const HotelInvitations: React.FC = () => {
  const { rfpId } = useParams<{ rfpId: string }>();
  const navigate = useNavigate();
  const [rfp, setRfp] = useState<RFP | null>(null);
  const [event, setEvent] = useState<CommissionEventWithLineItems | null>(null);
  const [invitations, setInvitations] = useState<HotelInvitationWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (rfpId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfpId]);

  const loadData = async () => {
    if (!rfpId) return;
    try {
      setLoading(true);
      const rfpData = await rfpApi.getRFP(rfpId);
      const [eventData, invitationsData] = await Promise.all([
        commissionApi.getEvent(rfpData.event_id),
        hotelInvitationApi.getInvitations(rfpId),
      ]);
      setRfp(rfpData);
      setEvent(eventData);
      setInvitations(invitationsData);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const inviteHotel = async (hotel: HotelConsidered) => {
    if (!rfpId) return;
    try {
      await hotelInvitationApi.createInvitation(rfpId, { event_hotel_id: hotel.id });
      loadData();
    } catch (err: any) {
      alert(getApiErrorMessage(err, 'Failed to create invitation'));
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    if (!window.confirm('Revoke this invitation? Their public link will stop working.')) return;
    try {
      await hotelInvitationApi.deleteInvitation(invitationId);
      loadData();
    } catch (err: any) {
      alert(getApiErrorMessage(err, 'Failed to revoke invitation'));
    }
  };

  const copyInvitationLink = (guid: string) => {
    const link = `${window.location.origin}/hotel-response/${guid}`;
    navigator.clipboard.writeText(link);
    alert('Link copied to clipboard!');
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      not_started: 'bg-gray-200 text-gray-800',
      in_progress: 'bg-yellow-200 text-yellow-800',
      completed: 'bg-green-200 text-green-800',
    };
    const labels: Record<string, string> = {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      completed: 'Completed',
    };
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status] || ''}`}>
        {labels[status] || status}
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
  if (!rfp || !event) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center">RFP not found</div>
      </div>
    );
  }

  const invitedHotelIds = new Set(invitations.map((inv) => inv.event_hotel_id).filter(Boolean) as string[]);
  const availableHotels = event.hotels_considered.filter((h) => !invitedHotelIds.has(h.id));

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate(`/commissions/${event.id}`)}
          className="text-blue-600 hover:text-blue-800 mb-2"
        >
          ← Back to Event
        </button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Hotel Invitations</h1>
            <p className="text-gray-600 mt-1">
              {event.meeting_name}
              {' · '}
              {fmtDate(event.arrival_date)} – {fmtDate(event.depart_date)}
            </p>
          </div>
          <button
            onClick={() => navigate(`/rfps/${rfpId}/responses`)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            View Responses
          </button>
        </div>
      </div>

      {/* Available candidate hotels (from the event's hotels_considered) */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Candidate Hotels</h2>
        {event.hotels_considered.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No candidate hotels on this event yet. Add some on the event page first.
          </p>
        ) : availableHotels.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            All candidate hotels have already been invited.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {availableHotels.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {h.name}
                    {h.is_selected && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold px-1.5 py-0.5 bg-emerald-100 rounded">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {h.contact_name || <em className="text-gray-400">No contact</em>}
                    {h.contact_email && <span className="ml-2">{h.contact_email}</span>}
                    {!h.contact_email && (
                      <span className="ml-2 text-orange-600">⚠ contact email missing</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => inviteHotel(h)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                >
                  Invite
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invitations table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Invited Hotels</h2>
        </div>
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
                  No hotels invited yet. Pick from the candidates above.
                </td>
              </tr>
            ) : (
              invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {invitation.hotel_name || <em className="text-gray-400">(deleted)</em>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {invitation.contact_name || <em className="text-gray-400">—</em>}
                    </div>
                    <div className="text-xs text-gray-500">{invitation.contact_email || '—'}</div>
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
                        onClick={() => navigate(`/rfps/${rfpId}/responses`)}
                        className="text-green-600 hover:text-green-900 mr-4"
                      >
                        View Response
                      </button>
                    )}
                    <button
                      onClick={() => revokeInvitation(invitation.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Revoke
                    </button>
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
