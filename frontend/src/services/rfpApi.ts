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
  RoomNight,
  RoomNightCreate,
  RoomNightResponseCreate,
} from '../types/rfp';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3501/api/v1/stellina';

// Get auth token from localStorage
const getAuthToken = () => localStorage.getItem('access_token');

// Create axios instance with auth
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

// RFP APIs (Admin)
export const rfpApi = {
  // Create RFP
  createRFP: async (rfp: RFPCreate): Promise<RFP> => {
    const response = await apiClient.post('/rfps', rfp);
    return response.data;
  },

  // List RFPs
  listRFPs: async (): Promise<RFP[]> => {
    const response = await apiClient.get('/rfps');
    return response.data;
  },

  // Get RFP with details
  getRFP: async (rfpId: number): Promise<RFPWithDetails> => {
    const response = await apiClient.get(`/rfps/${rfpId}`);
    return response.data;
  },

  // Update RFP
  updateRFP: async (rfpId: number, rfp: RFPCreate): Promise<RFP> => {
    const response = await apiClient.put(`/rfps/${rfpId}`, rfp);
    return response.data;
  },

  // Delete RFP
  deleteRFP: async (rfpId: number): Promise<void> => {
    await apiClient.delete(`/rfps/${rfpId}`);
  },

  // Room Nights
  addRoomNight: async (rfpId: number, roomNight: RoomNightCreate): Promise<RoomNight> => {
    const response = await apiClient.post(`/rfps/${rfpId}/room-nights`, roomNight);
    return response.data;
  },

  getRoomNights: async (rfpId: number): Promise<RoomNight[]> => {
    const response = await apiClient.get(`/rfps/${rfpId}/room-nights`);
    return response.data;
  },

  updateRoomNight: async (roomNightId: number, roomNight: RoomNightCreate): Promise<RoomNight> => {
    const response = await apiClient.put(`/rfps/room-nights/${roomNightId}`, roomNight);
    return response.data;
  },

  deleteRoomNight: async (roomNightId: number): Promise<void> => {
    await apiClient.delete(`/rfps/room-nights/${roomNightId}`);
  },

  // Meeting Rooms
  addMeetingRoom: async (rfpId: number, meetingRoom: MeetingRoomCreate): Promise<MeetingRoom> => {
    const response = await apiClient.post(`/rfps/${rfpId}/meeting-rooms`, meetingRoom);
    return response.data;
  },

  getMeetingRooms: async (rfpId: number): Promise<MeetingRoom[]> => {
    const response = await apiClient.get(`/rfps/${rfpId}/meeting-rooms`);
    return response.data;
  },

  updateMeetingRoom: async (
    meetingRoomId: number,
    meetingRoom: MeetingRoomCreate
  ): Promise<MeetingRoom> => {
    const response = await apiClient.put(
      `/rfps/meeting-rooms/${meetingRoomId}`,
      meetingRoom
    );
    return response.data;
  },

  deleteMeetingRoom: async (meetingRoomId: number): Promise<void> => {
    await apiClient.delete(`/rfps/meeting-rooms/${meetingRoomId}`);
  },

  // Custom Questions
  addCustomQuestion: async (
    rfpId: number,
    question: CustomQuestionCreate,
    orderIndex: number = 0
  ): Promise<CustomQuestion> => {
    const response = await apiClient.post(
      `/rfps/${rfpId}/custom-questions?order_index=${orderIndex}`,
      question
    );
    return response.data;
  },

  getCustomQuestions: async (rfpId: number): Promise<CustomQuestion[]> => {
    const response = await apiClient.get(`/rfps/${rfpId}/custom-questions`);
    return response.data;
  },

  updateCustomQuestion: async (
    questionId: number,
    question: CustomQuestionCreate
  ): Promise<CustomQuestion> => {
    const response = await apiClient.put(
      `/rfps/custom-questions/${questionId}`,
      question
    );
    return response.data;
  },

  deleteCustomQuestion: async (questionId: number): Promise<void> => {
    await apiClient.delete(`/rfps/custom-questions/${questionId}`);
  },
};

// Hotel Invitation APIs (Admin)
export const hotelInvitationApi = {
  // Create invitation
  createInvitation: async (
    rfpId: number,
    invitation: HotelInvitationCreate
  ): Promise<HotelInvitation> => {
    const response = await apiClient.post(
      `/hotel-invitations/${rfpId}/invitations`,
      invitation
    );
    return response.data;
  },

  // Get invitations for RFP
  getInvitations: async (rfpId: number): Promise<HotelInvitationWithStats[]> => {
    const response = await apiClient.get(`/hotel-invitations/${rfpId}/invitations`);
    return response.data;
  },

  // Get all responses for RFP
  getAllResponses: async (rfpId: number): Promise<HotelResponseView[]> => {
    const response = await apiClient.get(`/hotel-invitations/${rfpId}/responses`);
    return response.data;
  },

  // Get single response
  getSingleResponse: async (invitationId: number): Promise<HotelResponseView> => {
    const response = await apiClient.get(
      `/hotel-invitations/response/${invitationId}`
    );
    return response.data;
  },
};

// Public Hotel Response APIs (No auth required)
export const publicHotelApi = {
  // Get RFP by GUID
  getRFPByGuid: async (guid: string): Promise<RFPWithDetails> => {
    const response = await axios.get(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/rfp`
    );
    return response.data;
  },

  // Get invitation info
  getInvitationInfo: async (guid: string) => {
    const response = await axios.get(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/invitation`
    );
    return response.data;
  },

  // Get my response
  getMyResponse: async (guid: string): Promise<HotelResponseView> => {
    const response = await axios.get(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/response`
    );
    return response.data;
  },

  // Save room night response
  saveRoomNightResponse: async (
    guid: string,
    response: RoomNightResponseCreate
  ): Promise<void> => {
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/room-nights`,
      response
    );
  },

  // Save meeting room response
  saveMeetingRoomResponse: async (
    guid: string,
    response: MeetingRoomResponseCreate
  ): Promise<void> => {
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/meeting-rooms`,
      response
    );
  },

  // Save custom question response
  saveCustomQuestionResponse: async (
    guid: string,
    response: CustomQuestionResponseCreate
  ): Promise<void> => {
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/custom-questions`,
      response
    );
  },

  // Save comments
  saveComments: async (guid: string, comments?: string): Promise<void> => {
    await axios.post(
      `${API_BASE_URL}/hotel-invitations/public/${guid}/comments`,
      { comments }
    );
  },

  // Submit response
  submitResponse: async (guid: string): Promise<void> => {
    await axios.post(`${API_BASE_URL}/hotel-invitations/public/${guid}/submit`);
  },
};
