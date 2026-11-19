import { useRemoteResource } from '../../platform/state'
import { commissionApi } from './api'

export function useCommissionEvents() {
  return useRemoteResource('commissions:events:protected', signal => commissionApi.listEvents(signal))
}

