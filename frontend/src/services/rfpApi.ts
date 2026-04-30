import axios from 'axios';
import type {
  CustomQuestion,
  CustomQuestionCreate,
  CustomQuestionResponseCreate,
  HotelInvitation,
  HotelInvitationCreate,
  HotelInvitationWithStats,
  HotelResponseView,
  MeetingRoom,
  MeetingRoomCreate,
  MeetingRoomResponseCreate,
  RFP,
  RFPCreate,
  RFPWithDetails,
  RFPWithEventSummary,
  RoomNight,
  RoomNightCreate,
  RoomNightResponseCreate,
} from '../types/rfp';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

const getAuthToken = () => localStorage.getItem('access_token');

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// RFP APIs (Admin) — RFPs are anchored to a commission_event.
export const rfpApi = {
  // Create RFP under a commission event
  createRFPForEvent: async (eventId: string, rfp: RFPCreate): Promise<RFP> => {
    const response = await apiClient.post(`/commissions/${eventId}/rfps`, rfp);
    return response.data;
  },

  // List RFPs for a single commission event
  listRFPsForEvent: async (eventId: string): Promise<RFP[]> => {
    const response = await apiClient.get(`/commissions/${eventId}/rfps`);
    return response.data;
  },

  // Cross-event listing (top-nav RFPs page)
  listRFPs: async (): Promise<RFPWithEventSummary[]> => {
    const response = await apiClient.get('/rfps');
    return response.data;
  },

  // Get RFP with details
  getRFP: async (rfpId: string): Promise<RFPWithDetails> => {
    const response = await apiClient.get(`/rfps/${rfpId}`);
    return response.data;
  },

  // Update RFP
  updateRFP: async (rfpId: string, rfp: RFPCreate): Promise<RFP> => {
    const response = await apiClient.put(`/rfps/${rfpId}`, rfp);
    return response.data;
  },

  // Delete RFP
  deleteRFP: async (rfpId: string): Promise<void> => {
    await apiClient.delete(`/rfps/${rfpId}`);
  },

  // Room Nights
  addRoomNight: async (rfpId: string, roomNight: RoomNightCreate): Promise<RoomNight> => {
    const response = await apiClient.post(`/rfps/${rfpId}/room-nights`, roomNight);
    return response.data;
  },

  getRoomNights: async (rfpId: string): Promise<RoomNight[]> => {
    const response = await apiClient.get(`/rfps/${rfpId}/room-nights`);
    return response.data;
  },

  updateRoomNight: async (roomNightId: string, roomNight: RoomNightCreate): Promise<RoomNight> => {
    const response = await apiClient.put(`/rfps/room-nights/${roomNightId}`, roomNight);
    return response.data;
  },

  deleteRoomNight: async (roomNightId: string): Promise<void> => {
    await apiClient.delete(`/rfps/room-nights/${roomNightId}`);
  },

  // Meeting Rooms
  addMeetingRoom: async (rfpId: string, meetingRoom: MeetingRoomCreate): Promise<MeetingRoom> => {
    const response = await apiClient.post(`/rfps/${rfpId}/meeting-rooms`, meetingRoom);
    return response.data;
  },

  getMeetingRooms: async (rfpId: string): Promise<MeetingRoom[]> => {
    const response = await apiClient.get(`/rfps/${rfpId}/meeting-rooms`);
    return response.data;
  },

  updateMeetingRoom: async (
    meetingRoomId: string,
    meetingRoom: MeetingRoomCreate
  ): Promise<MeetingRoom> => {
    const response = await apiClient.put(
      `/rfps/meeting-rooms/${meetingRoomId}`,
      meetingRoom
    );
    return response.data;
  },

  deleteMeetingRoom: async (meetingRoomId: string): Promise<void> => {
    await apiClient.delete(`/rfps/meeting-rooms/${meetingRoomId}`);
  },

  // Custom Questions
  addCustomQuestion: async (
    rfpId: string,
    question: CustomQuestionCreate,
    orderIndex: number = 0
  ): Promise<CustomQuestion> => {
    const response = await apiClient.post(
      `/rfps/${rfpId}/custom-questions?order_index=${orderIndex}`,
      question
    );
    return response.data;
  },

  getCustomQuestions: async (rfpId: string): Promise<CustomQuestion[]> => {
    const response = await apiClient.get(`/rfps/${rfpId}/custom-questions`);
    return response.data;
  },

  updateCustomQuestion: async (
    questionId: string,
    question: CustomQuestionCreate
  ): Promise<CustomQuestion> => {
    const response = await apiClient.put(
      `/rfps/custom-questions/${questionId}`,
      question
    );
    return response.data;
  },

  deleteCustomQuestion: async (questionId: string): Promise<void> => {
    await apiClient.delete(`/rfps/custom-questions/${questionId}`);
  },

  // RFP attachments (admin-uploaded docs hoteliers download)
  listAttachments: async (rfpId: string): Promise<Array<{
    id: string; rfp_id: string; filename: string; size_bytes: number;
    content_type?: string | null; uploaded_at: string;
  }>> => {
    const res = await apiClient.get(`/rfps/${rfpId}/attachments`);
    return res.data;
  },

  uploadAttachment: async (rfpId: string, file: File): Promise<void> => {
    const form = new FormData();
    form.append('file', file);
    await apiClient.post(`/rfps/${rfpId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  deleteAttachment: async (attachmentId: string): Promise<void> => {
    await apiClient.delete(`/rfps/attachments/${attachmentId}`);
  },
};

// Hotel Invitation APIs (Admin) — invitations reference event_hotel_id (a candidate hotel on the event)
export const hotelInvitationApi = {
  createInvitation: async (
    rfpId: string,
    invitation: HotelInvitationCreate
  ): Promise<HotelInvitation> => {
    const response = await apiClient.post(
      `/hotel-invitations/${rfpId}/invitations`,
      invitation
    );
    return response.data;
  },

  getInvitations: async (rfpId: string): Promise<HotelInvitationWithStats[]> => {
    const response = await apiClient.get(`/hotel-invitations/${rfpId}/invitations`);
    return response.data;
  },

  deleteInvitation: async (invitationId: string): Promise<void> => {
    await apiClient.delete(`/hotel-invitations/invitations/${invitationId}`);
  },

  getAllResponses: async (rfpId: string): Promise<HotelResponseView[]> => {
    const response = await apiClient.get(`/hotel-invitations/${rfpId}/responses`);
    return response.data;
  },

  getSingleResponse: async (invitationId: string): Promise<HotelResponseView> => {
    const response = await apiClient.get(
      `/hotel-invitations/response/${invitationId}`
    );
    return response.data;
  },
};

// Public Hotel Response APIs (No auth required)
export const publicHotelApi = {
  getRFPByGuid: async (guid: string): Promise<RFPWithDetails> => {
    const response = await axios.get(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/rfp`
    );
    return response.data;
  },

  getInvitationInfo: async (guid: string) => {
    const response = await axios.get(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/invitation`
    );
    return response.data;
  },

  getMyResponse: async (guid: string): Promise<HotelResponseView> => {
    const response = await axios.get(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/response`
    );
    return response.data;
  },

  saveRoomNightResponse: async (
    guid: string,
    response: RoomNightResponseCreate
  ): Promise<void> => {
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/room-nights`,
      response
    );
  },

  saveMeetingRoomResponse: async (
    guid: string,
    response: MeetingRoomResponseCreate
  ): Promise<void> => {
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/meeting-rooms`,
      response
    );
  },

  saveCustomQuestionResponse: async (
    guid: string,
    response: CustomQuestionResponseCreate
  ): Promise<void> => {
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/custom-questions`,
      response
    );
  },

  saveComments: async (guid: string, comments?: string): Promise<void> => {
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/comments`,
      { comments }
    );
  },

  submitResponse: async (guid: string): Promise<void> => {
    await axios.post(`${API_BASE_URL}/hotel-invitations/public/${guid}/submit`);
  },

  listAttachments: async (guid: string): Promise<Array<{
    id: string; filename: string; size_bytes: number; content_type?: string | null; uploaded_at?: string;
  }>> => {
    const res = await axios.get(`${API_BASE_URL}/hotel-invitations/public/${guid}/attachments`);
    return res.data;
  },

  uploadAttachment: async (guid: string, file: File): Promise<void> => {
    const form = new FormData();
    form.append('file', file);
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  deleteAttachment: async (guid: string, attachmentId: string): Promise<void> => {
    await axios.delete(`${API_BASE_URL}/hotel-invitations/public/${guid}/attachments/${attachmentId}`);
  },

  listRfpAttachments: async (guid: string): Promise<Array<{
    id: string; filename: string; size_bytes: number; content_type?: string | null; url?: string | null;
  }>> => {
    const res = await axios.get(`${API_BASE_URL}/hotel-invitations/public/${guid}/rfp-attachments`);
    return res.data;
  },
};
