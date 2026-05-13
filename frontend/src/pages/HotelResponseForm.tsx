import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicHotelApi } from '../services/rfpApi';
import type { HotelResponseView, RFPWithDetails } from '../types/rfp';
import PartnerPortalShell from '../components/PartnerPortalShell';
import RFPResponseFormBody, { type RFPDocAttachment, type RFPInfo, type UploadedAttachment } from '../components/RFPResponseFormBody';

const HotelResponseForm: React.FC = () => {
  const { guid } = useParams<{ guid: string }>();
  const [rfp, setRfp] = useState<RFPWithDetails | null>(null);
  const [info, setInfo] = useState<RFPInfo | null>(null);
  const [response, setResponse] = useState<HotelResponseView | null>(null);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [rfpDocs, setRfpDocs] = useState<RFPDocAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadAttachments = async () => {
    if (!guid) return;
    try {
      setAttachments(await publicHotelApi.listAttachments(guid));
    } catch {
      // Treat as empty if backend doesn't have attachments yet.
      setAttachments([]);
    }
  };

  useEffect(() => {
    if (!guid) return;
    let cancelled = false;
    (async () => {
      try {
        const [rfpData, infoData, responseData] = await Promise.all([
          publicHotelApi.getRFPByGuid(guid),
          publicHotelApi.getInvitationInfo(guid),
          publicHotelApi.getMyResponse(guid).catch(() => null),
        ]);
        if (cancelled) return;
        setRfp(rfpData);
        setInfo(infoData);
        setResponse(responseData);
        if (infoData.is_completed) setSubmitted(true);
        await reloadAttachments();
        try {
          const docs = await publicHotelApi.listRfpAttachments(guid);
          if (!cancelled) setRfpDocs(docs);
        } catch { /* RFP attachments table may not exist yet */ }
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.response?.data?.detail || 'Failed to load RFP. Please check your link.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guid]);

  if (loading) {
    return (
      <PartnerPortalShell>
        <div className="text-center text-slate-500 py-12">Loading…</div>
      </PartnerPortalShell>
    );
  }
  if (loadError || !rfp || !info) {
    return (
      <PartnerPortalShell>
        <div className="text-center text-red-600 py-12">{loadError || 'Invalid or expired link.'}</div>
      </PartnerPortalShell>
    );
  }

  if (submitted) {
    return (
      <PartnerPortalShell>
        <section className="rounded-2xl shadow-md ring-1 ring-emerald-200 bg-white overflow-hidden">
          <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' }}>
            <h1 className="text-2xl font-bold text-emerald-900">Thank you!</h1>
            <p className="text-emerald-800 text-sm mt-1">Your response has been submitted.</p>
          </div>
          <div className="px-6 py-5 text-sm text-slate-700">
            Your response for <strong>{info.event_meeting_name || 'this booking'}</strong> has been recorded.
            If you need to make changes, please contact the RFP organizer.
          </div>
        </section>
      </PartnerPortalShell>
    );
  }

  return (
    <PartnerPortalShell>
      <RFPResponseFormBody
        rfp={rfp}
        info={info}
        initialResponse={response}
        attachments={attachments}
        rfpDocs={rfpDocs}
        onSaveRoomNight={(r) => publicHotelApi.saveRoomNightResponse(guid!, r)}
        onSaveMeetingRoom={(r) => publicHotelApi.saveMeetingRoomResponse(guid!, r)}
        onSaveQuestion={(r) => publicHotelApi.saveCustomQuestionResponse(guid!, r)}
        onSaveComments={(c) => publicHotelApi.saveComments(guid!, c)}
        onUploadFile={async (file) => {
          await publicHotelApi.uploadAttachment(guid!, file);
          await reloadAttachments();
        }}
        onRemoveAttachment={async (id) => {
          await publicHotelApi.deleteAttachment(guid!, id);
          await reloadAttachments();
        }}
        onSubmitFinal={async () => {
          await publicHotelApi.submitResponse(guid!);
          setSubmitted(true);
        }}
      />
    </PartnerPortalShell>
  );
};

export default HotelResponseForm;
