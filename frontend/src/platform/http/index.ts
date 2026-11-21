import axios, { AxiosError, type AxiosInstance, type AxiosResponse, type CreateAxiosDefaults } from 'axios';
import { createPublicHttpClient } from '@ninotasca/web-platform/http';
import { publicConfig } from '../config/index';
import { credentialStore } from '../auth/runtime';

// Browser URLs are always same-origin, including public and shared-auth requests.
export const STELLINA_API_URL = `${publicConfig.apiBaseUrl}/${publicConfig.manifest.api.productNamespace}`;
export const CORE_API_URL = `${publicConfig.apiBaseUrl}/core`;
const REQUEST_ID_HEADER = 'x-stellina-request-id';

const SAFE_DETAILS = new Set([
  'Google account not authorized', 'Email not provided by Google',
  'Could not validate credentials', 'Not enough permissions. Admin access required.',
  'Provide an email or a domain', 'Provide a field to update', 'Provide company or company_id',
  'Event not found', 'Hotel not found', 'Line item not found', 'Note not found',
  'Points entry not found', 'RFP not found', 'Invitation not found', 'Response not found',
  'Attachment not found', 'Site selection form not found', 'No Cvent tracker for this booking',
  'Merge job not found', 'Conflict not found', 'Upload not found', 'Backup profile not found',
  'File must be a .xlsx', 'Empty file', 'Sheet not found on this upload',
  'Cvent originals are read-only; edit the Master version instead.',
  'Unresolved conflicts/proposals remain — cannot complete merge',
]);
const VALIDATION_MESSAGES: Record<string, string> = {
  missing: 'A required value is missing.', value_error: 'A value is invalid.',
  string_type: 'Enter text.', string_pattern_mismatch: 'Use the required format.',
  int_parsing: 'Enter a whole number.', int_type: 'Enter a whole number.',
  float_parsing: 'Enter a number.', float_type: 'Enter a number.',
  bool_parsing: 'Choose true or false.', enum: 'Choose an allowed value.',
  greater_than_equal: 'The value is below the allowed minimum.',
  less_than_equal: 'The value is above the allowed maximum.',
  date_from_datetime_parsing: 'Enter a valid date.',
};
const SAFE_FIELDS = new Set([
  'body', 'query', 'path', 'grouping', 'statuses', 'start', 'end', 'email', 'domain',
  'weight_definite', 'weight_tentative', 'weight_prospect', 'include_test_bookings',
  'name', 'title', 'amount', 'is_active', 'event_id', 'company', 'company_id',
]);

type SafeValidation = { loc: (string | number)[]; type: string; msg: string };
type ErrorBody = { detail?: unknown; request_id?: unknown; correlation_id?: unknown };
type AttachmentFailure = {
  code: 'attachment_save_unavailable' | 'attachment_save_ambiguous' | 'attachment_save_timeout';
  message: string;
  correlation_id?: unknown;
};

const ATTACHMENT_FAILURE_MESSAGES: Record<AttachmentFailure['code'], string> = {
  attachment_save_unavailable: 'Attachment service is unavailable. Try again later.',
  attachment_save_ambiguous: 'Attachment save could not be confirmed. Refresh the attachment list before trying again.',
  attachment_save_timeout: 'Attachment save timed out. Refresh the attachment list before trying again.',
};

function attachmentFailure(detail: unknown): AttachmentFailure | null {
  if (!detail || typeof detail !== 'object') return null;
  const candidate = detail as Partial<AttachmentFailure>;
  if (typeof candidate.code !== 'string' || !Object.hasOwn(ATTACHMENT_FAILURE_MESSAGES, candidate.code)) return null;
  const code = candidate.code as AttachmentFailure['code'];
  if (candidate.message !== ATTACHMENT_FAILURE_MESSAGES[code]) return null;
  return { code, message: candidate.message, correlation_id: candidate.correlation_id };
}

function validId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function jsonBody(data: unknown): ErrorBody | null {
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return null; }
  }
  return data !== null && typeof data === 'object' ? data as ErrorBody : null;
}

function validationDetails(detail: unknown): SafeValidation[] {
  if (!Array.isArray(detail)) return [];
  return detail.slice(0, 20).map((item) => {
    const entry = item && typeof item === 'object' ? item : {};
    const type = typeof entry.type === 'string' && Object.hasOwn(VALIDATION_MESSAGES, entry.type) ? entry.type : 'value_error';
    const loc = Array.isArray(entry.loc) ? entry.loc.slice(0, 8).filter((part: unknown) =>
      (typeof part === 'string' && SAFE_FIELDS.has(part)) || (typeof part === 'number' && Number.isInteger(part) && part >= 0 && part < 10000)) : [];
    return { loc, type, msg: VALIDATION_MESSAGES[type] };
  });
}

export function normalizeApiError(error: unknown): never {
  // Preserve Axios cancellation identity/code and callers' abort handling.
  if (axios.isCancel(error) || !axios.isAxiosError(error)) throw error;
  const response = error.response;
  const body = jsonBody(response?.data);
  const attachment = attachmentFailure(body?.detail);
  const requestId = validId(response?.headers['x-correlation-id']) || validId(response?.headers[REQUEST_ID_HEADER])
    || validId(attachment?.correlation_id) || validId(body?.correlation_id) || validId(body?.request_id);
  const status = response?.status;
  let detail = 'Stellina could not reach the data service. Please try again.';
  const validation = status === 422 ? validationDetails(body?.detail) : [];
  if (response) {
    if (error.code === 'ERR_BAD_RESPONSE' && status && status < 400) {
      detail = 'Stellina received an unreadable response from the data service.';
    } else if (attachment && [502, 503, 504].includes(status || 0)) {
      detail = attachment.message;
    } else if (status === 504) {
      detail = 'The Stellina data service took too long to respond.';
    } else if (status && status >= 500) {
      detail = 'The Stellina data service is unavailable. Please try again.';
    } else if (typeof body?.detail === 'string' && SAFE_DETAILS.has(body.detail)) {
      detail = body.detail;
    } else if (status === 400 && typeof body?.detail === 'string' && body.detail.startsWith('Could not read .xlsx:')) {
      detail = 'Could not read .xlsx. Please upload a valid workbook.';
    } else if (status === 400 && typeof body?.detail === 'string' && body.detail.startsWith('Unsupported content type')) {
      detail = 'Unsupported content type. Please upload an .xlsx workbook.';
    } else if (status === 413) {
      detail = 'The uploaded file is too large. Please use a smaller file.';
    } else if (status === 422) {
      detail = validation.length
        ? `Please check your entries. ${validation.map(v => `${v.loc.filter(p => !['body', 'query', 'path'].includes(String(p))).join('.') || 'Value'}: ${v.msg}`).join(' ')}`
        : 'Please check your entries and try again.';
    } else if (status === 401) {
      detail = 'Please sign in again.';
    } else if (status === 403) {
      detail = 'You do not have permission to perform this action.';
    } else if (status === 404) {
      detail = 'The requested item was not found.';
    } else {
      detail = `The Stellina request failed (status ${status}). Please try again.`;
    }
  }
  const message = `${detail}${requestId ? ` Reference: ${requestId}` : ''}`;
  error.message = message;
  // Existing screens consume response.data.detail; keep it a safe renderable string.
  // Keep Axios identity, status, headers, config and the no-response network distinction.
  if (response) response.data = { detail: message, ...(requestId ? { request_id: requestId } : {}), ...(validation.length ? { validation_errors: validation } : {}) };
  Object.assign(error, {
    requestId, correlationId: requestId, status: status ?? 0,
    errorClass: attachment ? 'AttachmentSaveFailure' : status === 401 ? 'AuthenticationRequired' : status === 403 ? 'AuthorizationDenied' : status && status >= 500 ? 'ServiceUnavailable' : response ? 'RequestRejected' : 'UpstreamConnectionError',
    attachmentErrorCode: attachment?.code, validationErrors: validation,
  });
  throw error;
}

function checkJsonResponse(response: AxiosResponse): AxiosResponse {
  const type = response.config.responseType;
  if (type && type !== 'json') return response; // Leave blobs/downloads alone.
  if (response.status === 204 || response.status === 205 || response.config.method === 'head' || response.data === '') return response;
  if (typeof response.data === 'string') {
    try { response.data = JSON.parse(response.data); } catch {
      throw new AxiosError('Unreadable JSON response', 'ERR_BAD_RESPONSE', response.config, response.request, response);
    }
  }
  return response;
}

export function createApiClient(config: CreateAxiosDefaults = {}): AxiosInstance {
  // Parse in the interceptor so malformed JSON retains status and response headers.
  const client = axios.create({ ...config, transformResponse: [(data) => data] });
  client.interceptors.response.use(checkJsonResponse);
  client.interceptors.response.use(response => response, normalizeApiError);
  return client;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  return axios.isAxiosError(error) && !axios.isCancel(error) ? error.message : fallback;
}

const AUTH_VISIT_KEY = 'unoventi.auth-visit-id';

function browserVisitId(): string {
  try {
    const existing = sessionStorage.getItem(AUTH_VISIT_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID(); sessionStorage.setItem(AUTH_VISIT_KEY, created); return created;
  } catch { return crypto.randomUUID(); }
}

// Shared public transport is used by Core authentication. Product endpoints keep
// their Axios adapter for binary uploads/downloads and response-shape compatibility.
export const platformPublicClient = createPublicHttpClient({
  baseUrl: '', siteId: publicConfig.manifest.auth.siteKey, getVisitId: browserVisitId,
  fetch: (input, init) => globalThis.fetch(input, init),
});

// Public requests receive only bounded routing/correlation metadata. They never
// read credentials and never install authentication rejection behavior.
export const publicApiClient = createApiClient();
publicApiClient.interceptors.request.use((config) => {
  config.headers.set('X-Unoventi-Site-Id', publicConfig.manifest.auth.siteKey);
  config.headers.set('X-Unoventi-Visit-Id', browserVisitId());
  if (!config.headers.has('X-Correlation-Id')) config.headers.set('X-Correlation-Id', crypto.randomUUID());
  return config;
});

export function createProtectedApiClient(baseURL: typeof STELLINA_API_URL | typeof CORE_API_URL): AxiosInstance {
  const client = createApiClient({ baseURL, headers: { 'Content-Type': 'application/json' } });
  client.interceptors.request.use((config) => {
    const credential = credentialStore.snapshot();
    const token = credential.accessToken;
    Object.assign(config, { credentialGeneration: credential.generation });
    config.headers.set('X-Unoventi-Site-Id', publicConfig.manifest.auth.siteKey);
    config.headers.set('X-Unoventi-Visit-Id', browserVisitId());
    if (!config.headers.has('X-Correlation-Id')) config.headers.set('X-Correlation-Id', crypto.randomUUID());
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });
  client.interceptors.response.use(response => response, (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && typeof window !== 'undefined') {
      const generation = Number((error.config as typeof error.config & { credentialGeneration?: number })?.credentialGeneration);
      if (Number.isInteger(generation)) window.dispatchEvent(new CustomEvent('unoventi:auth-rejected', { detail: { generation } }));
    }
    return Promise.reject(error);
  });
  return client;
}

export const stellinaProtectedApiClient = createProtectedApiClient(STELLINA_API_URL);
export const coreProtectedApiClient = createProtectedApiClient(CORE_API_URL);
