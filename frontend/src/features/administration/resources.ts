import { useRemoteResource } from '../../platform/state'
import { administrationApi } from './api'

export function useLoginAttempts(limit = 100, cursor?: string) {
  return useRemoteResource(`administration:login-attempts:protected:${limit}:${cursor ?? ''}`, signal => administrationApi.getLoginAttempts(limit, cursor, signal))
}

