import axios from 'axios';
import { clientLog } from '../../platform/diagnostics/index';

type RfpFailureEvent =
  | 'stellina.rfp.save_failed'
  | 'stellina.rfp.invitations_load_failed'
  | 'stellina.rfp.responses_load_failed';

// Copy only bounded primitives. Axios errors retain credential-bearing config,
// request/response objects and arbitrary text, even after UI error normalization.
export function logRfpFailure(event: RfpFailureEvent, error: unknown): void {
  try {
    if (axios.isAxiosError(error)) {
      clientLog('error', event, {
        status: error.response?.status,
        error_class: error.response ? 'HttpError' : 'NetworkError',
      });
    } else {
      clientLog('error', event, { error_class: 'UnknownError' });
    }
  } catch { /* Diagnostics must not prevent loading cleanup or error UI. */ }
}
