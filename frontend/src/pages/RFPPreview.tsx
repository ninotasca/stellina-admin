import { getApiErrorMessage } from '../services/http';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { rfpApi } from '../services/rfpApi';
import { commissionApi } from '../services/commissionApi';
import type { RFPWithDetails } from '../types/rfp';
import type { CommissionEventWithLineItems } from '../types/commission';
import PartnerPortalShell from '../components/PartnerPortalShell';
import RFPResponseFormBody, { type RFPDocAttachment, type RFPInfo } from '../components/RFPResponseFormBody';

const RFPPreview: React.FC = () => {
  const { rfpId } = useParams<{ rfpId: string }>();
  const [rfp, setRfp] = useState<RFPWithDetails | null>(null);
  const [event, setEvent] = useState<CommissionEventWithLineItems | null>(null);
  const [rfpDocs, setRfpDocs] = useState<RFPDocAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rfpId) return;
    let cancelled = false;
    (async () => {
      try {
        const rfpData = await rfpApi.getRFP(rfpId);
        const eventData = await commissionApi.getEvent(rfpData.event_id);
        if (!cancelled) { setRfp(rfpData); setEvent(eventData); }
        try {
          const att = await rfpApi.listAttachments(rfpId);
          if (!cancelled) {
            setRfpDocs(att.map((a) => ({
              id: a.id, filename: a.filename, size_bytes: a.size_bytes, url: null,
            })));
          }
        } catch { /* table may not exist yet */ }
      } catch (e: any) {
        if (!cancelled) setError(getApiErrorMessage(e, 'Failed to load RFP'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rfpId]);

  const banner = (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔍</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">Preview mode</p>
            <p className="text-xs text-amber-800">
              This is what hotels see. <strong>Nothing you enter or upload here will be saved.</strong>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          className="shrink-0 px-3 py-1.5 text-xs text-amber-900 bg-white border border-amber-300 rounded hover:bg-amber-100"
        >
          Close tab
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <PartnerPortalShell banner={banner}>
        <div className="text-center text-slate-500 py-12">Loading…</div>
      </PartnerPortalShell>
    );
  }
  if (error || !rfp || !event) {
    return (
      <PartnerPortalShell banner={banner}>
        <div className="text-center text-red-600 py-12">{error || 'Not found'}</div>
      </PartnerPortalShell>
    );
  }

  const info: RFPInfo = {
    hotel_name: '[Hotel name shown to invitee]',
    contact_name: '[Contact name shown to invitee]',
    event_meeting_name: event.meeting_name,
    event_client_company_name: event.client_company_name ?? null,
    event_arrival_date: event.arrival_date,
    event_depart_date: event.depart_date,
    is_completed: false,
  };

  return (
    <PartnerPortalShell banner={banner}>
      <RFPResponseFormBody rfp={rfp} info={info} rfpDocs={rfpDocs} previewMode />
    </PartnerPortalShell>
  );
};

export default RFPPreview;
