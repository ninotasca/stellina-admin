import type { ReactNode } from 'react'

export type ViewStateKind = 'loading' | 'empty' | 'unauthenticated' | 'forbidden' | 'unavailable' | 'validation' | 'conflict' | 'unexpected'

const defaults: Record<ViewStateKind, { title: string; message: string }> = {
  loading: { title: 'Loading', message: 'Please wait while this view is prepared.' },
  empty: { title: 'Nothing here yet', message: 'There is no information to show.' },
  unauthenticated: { title: 'Sign in required', message: 'Sign in to continue.' },
  forbidden: { title: 'Access denied', message: 'Your account does not have access to this view.' },
  unavailable: { title: 'Temporarily unavailable', message: 'This information could not be reached.' },
  validation: { title: 'Check your information', message: 'Correct the highlighted information and try again.' },
  conflict: { title: 'This changed elsewhere', message: 'Refresh the latest information before trying again.' },
  unexpected: { title: 'Something went wrong', message: 'The view could not be completed.' },
}

export function ViewState({ kind, title, message, action, compact = false }: { kind: ViewStateKind; title?: string; message?: string; action?: ReactNode; compact?: boolean }) {
  const copy = defaults[kind]
  return <section className={`view-state view-state-${kind}${compact ? ' view-state-compact' : ''}`} role={kind === 'loading' ? 'status' : kind === 'empty' ? undefined : 'alert'} aria-live={kind === 'loading' ? 'polite' : 'assertive'} aria-busy={kind === 'loading' || undefined}>
    {kind === 'loading' && <span className="view-state-spinner" aria-hidden="true" />}
    <div><h2>{title ?? copy.title}</h2><p>{message ?? copy.message}</p></div>
    {action && <div className="view-state-action">{action}</div>}
  </section>
}

