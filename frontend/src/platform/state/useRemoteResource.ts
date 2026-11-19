import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createRemoteResource, type RemoteResourceState } from '@ninotasca/web-platform/state'
export type RemoteResource<T> = RemoteResourceState<T>
export function useRemoteResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>): RemoteResource<T> & { refetch: () => void; invalidate: () => void } {
  // `key` is the caller's explicit identity for every input captured by `load`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resource = useMemo(() => createRemoteResource({ load }), [key])
  const state = useSyncExternalStore(resource.subscribe, resource.snapshot, resource.snapshot)
  useEffect(() => { void resource.refetch(); return () => resource.destroy() }, [resource])
  return { ...state, refetch: () => { void resource.refetch() }, invalidate: () => { resource.invalidate(); void resource.refetch() } }
}
