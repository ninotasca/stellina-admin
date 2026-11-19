import { StateView, type ViewStateKind } from '@ninotasca/web-platform/ui'
import type { ReactNode } from 'react'
export type { ViewStateKind }
const defaults: Record<ViewStateKind, { title: string; message: string }> = {
  loading: { title: 'Loading', message: 'Please wait while this view is prepared.' }, empty: { title: 'Nothing here yet', message: 'There is no information to show.' },
  unauthenticated: { title: 'Sign in required', message: 'Sign in to continue.' }, forbidden: { title: 'Access denied', message: 'Your account does not have access to this view.' },
  unavailable: { title: 'Temporarily unavailable', message: 'This information could not be reached.' }, validation: { title: 'Check your information', message: 'Correct the highlighted information and try again.' },
  conflict: { title: 'This changed elsewhere', message: 'Refresh the latest information before trying again.' }, unexpected: { title: 'Something went wrong', message: 'The view could not be completed.' },
}
export function ViewState({ kind, title, message, action }: { kind: ViewStateKind; title?: string; message?: string; action?: ReactNode; compact?: boolean }) {
  const copy = defaults[kind]; return <StateView kind={kind} title={title ?? copy.title} action={action}>{message ?? copy.message}</StateView>
}
