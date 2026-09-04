import axios, { AxiosError, type AxiosInstance, type AxiosResponse, type CreateAxiosDefaults } from 'axios';

// Browser URLs are always same-origin, including public and shared-auth requests.
export const STELLINA_API_URL = '/api/v1/stellina';
export const CORE_API_URL = '/api/v1/core';
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
type ErrorBody = { detail?: unknown; request_id?: unknown };

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
  const requestId = validId(response?.headers[REQUEST_ID_HEADER]) || validId(body?.request_id);
  const status = response?.status;
  let detail = 'Stellina could not reach the data service. Please try again.';
  const validation = status === 422 ? validationDetails(body?.detail) : [];
  if (response) {
    if (error.code === 'ERR_BAD_RESPONSE' && status && status < 400) {
      detail = 'Stellina received an unreadable response from the data service.';
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
  Object.assign(error, { requestId, validationErrors: validation });
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

// Public requests deliberately have no bearer-token interceptor or login redirect.
export const publicApiClient = createApiClient();
