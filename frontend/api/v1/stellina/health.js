import { proxyStellinaRequest } from '../../../server/stellinaProxy.js'

// Keep every method's upstream semantics, including backend 405/OPTIONS responses.
export default { fetch: request => proxyStellinaRequest(request, '/api/v1/stellina/health') }
