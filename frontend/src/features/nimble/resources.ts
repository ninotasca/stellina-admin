import { useRemoteResource } from '../../platform/state'
import { nimbleApi } from './api'

export function useNimbleDeals(page = 1, perPage = 50) {
  return useRemoteResource(`nimble:deals:protected:${page}:${perPage}`, signal => nimbleApi.listDeals({ page, per_page: perPage }, signal))
}

