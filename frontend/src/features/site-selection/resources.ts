import { useRemoteResource } from '../../platform/state'
import { siteSelectionApi } from './api'

export function useSiteSelectionForms(eventId?: string) {
  return useRemoteResource(`site-selection:list:protected:${eventId ?? 'all'}`, signal => siteSelectionApi.listForms(eventId, signal))
}

