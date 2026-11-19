import { useCallback, useEffect, useEffectEvent, useState } from 'react'

export type RemoteResource<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: T | null; error: unknown }

export function useRemoteResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): RemoteResource<T> & { refetch: () => void; invalidate: () => void } {
  const runLoad = useEffectEvent(load)
  const [revision, setRevision] = useState(0)
  const requestKey = `${key}:${revision}`
  const [state, setState] = useState<RemoteResource<T> & { requestKey: string }>({ status: 'loading', data: null, error: null, requestKey })

  const refetch = useCallback(() => setRevision(value => value + 1), [])
  const invalidate = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    void runLoad(controller.signal).then(
      data => { if (!controller.signal.aborted) setState({ status: 'ready', data, error: null, requestKey }) },
      error => { if (!controller.signal.aborted) setState(current => ({ status: 'error', data: current.data, error, requestKey })) },
    )
    return () => controller.abort()
  }, [requestKey])

  const visible: RemoteResource<T> = state.requestKey === requestKey ? state : { status: 'loading', data: null, error: null }
  return { ...visible, refetch, invalidate }
}

