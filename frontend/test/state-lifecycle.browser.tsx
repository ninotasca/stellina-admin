import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useRemoteResource } from '../src/platform/state'

type Pending = { signal: AbortSignal; resolve: (value: string[]) => void; reject: (error: Error) => void }
declare global { interface Window { __stateHarness: { pending: Pending[]; current?: ReturnType<typeof useRemoteResource<string[]>>; setKey?: (key: string) => void } } }

const harnessRef = window.__stateHarness = { pending: [] }
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 50; attempt += 1) { if (predicate()) return; await tick() }
}

export function Fixture() {
  const [key, setKey] = useState('one')
  const resource = useRemoteResource(`fixture:${key}`, signal => new Promise<string[]>((resolve, reject) => {
    harnessRef.pending.push({ signal, resolve, reject })
  }))
  useEffect(() => {
    window.__stateHarness.current = resource
    window.__stateHarness.setKey = setKey
  }, [resource])
  return <div data-status={resource.status}>{resource.data?.join(',') ?? ''}</div>
}

async function run() {
  createRoot(document.getElementById('root')!).render(<Fixture />)
  await waitFor(() => harnessRef.current?.status === 'loading' && harnessRef.pending.length === 1)
  check(harnessRef.current?.status === 'loading' && harnessRef.pending.length === 1, 'initial loading state missing')
  harnessRef.pending[0].resolve(['first'])
  await waitFor(() => harnessRef.current?.status === 'ready')
  check(harnessRef.current?.status === 'ready' && harnessRef.current.data?.[0] === 'first', 'ready state missing')

  harnessRef.current!.invalidate()
  await waitFor(() => harnessRef.pending.length === 2 && harnessRef.current?.status === 'loading')
  check(harnessRef.pending[0].signal.aborted && harnessRef.current?.status === 'loading', 'invalidation did not cancel and reload')
  harnessRef.pending[1].reject(new Error('unavailable'))
  await waitFor(() => harnessRef.current?.status === 'error')
  check(harnessRef.current?.status === 'error' && harnessRef.current.data?.[0] === 'first', 'failure did not retain last good data')

  harnessRef.current!.refetch()
  await waitFor(() => harnessRef.pending.length === 3)
  check(harnessRef.pending.length === 3, 'retry did not load')
  harnessRef.setKey!('two')
  await waitFor(() => harnessRef.pending.length === 4)
  check(harnessRef.pending[2].signal.aborted && harnessRef.pending.length === 4, 'key change did not cancel stale load')
  harnessRef.pending[3].resolve([])
  await waitFor(() => harnessRef.current?.status === 'ready')
  check(harnessRef.current?.status === 'ready' && harnessRef.current.data?.length === 0, 'empty ready state missing')
  document.getElementById('result')!.textContent = 'PASS: loading; ready; invalidate; retained failure; retry; cancellation; empty'
}

void run().catch(error => { document.getElementById('result')!.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}` })

