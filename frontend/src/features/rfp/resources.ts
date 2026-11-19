import { useRemoteResource } from '../../platform/state'
import { rfpApi } from './api'

export function useRFPs() {
  return useRemoteResource('rfp:list:protected', signal => rfpApi.listRFPs(signal))
}

