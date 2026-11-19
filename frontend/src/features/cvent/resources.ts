import { useRemoteResource } from '../../platform/state'
import { cventTrackerApi } from './api'

export function useCventTrackers() {
  return useRemoteResource('cvent:trackers:protected', signal => cventTrackerApi.listAll(signal))
}

