import { proxyStellinaRequest } from '../../../../server/stellinaProxy.js'

export default { fetch: request => proxyStellinaRequest(request, '/api/v1/stellina/commissions/projections') }
