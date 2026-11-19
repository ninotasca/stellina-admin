import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Login from '../src/features/authentication/Login'
import { AuthContext, type AuthContextValue } from '../src/platform/auth/auth-context'

let refreshCount = 0
const value: AuthContextValue = {
  status: 'unavailable', context: null, message: 'Account service unavailable.', failure: null,
  policy: { site_key: 'stellina', site_uuid: null, enabled: true, providers: ['google'], registration: 'closed', password_reset: false, magic_login: false, session_max_age_minutes: 720, session_inactivity_minutes: 180, session_resume_after_minutes: 120 },
  policyLoading: false, refresh: async () => { refreshCount += 1 }, signOut: async () => {}, magicLogin: async () => {},
  user: null, loading: false, logout: async () => {}, isAuthenticated: false, isAdmin: false,
  googleLoginEnabled: true, magicLoginEnabled: false,
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

async function run() {
  createRoot(document.getElementById('root')!).render(<MemoryRouter><AuthContext.Provider value={value}><Login /></AuthContext.Provider></MemoryRouter>)
  await tick(); await tick()
  const alert = document.querySelector('[role="alert"]')
  const button = [...document.querySelectorAll('button')].find(node => node.textContent?.includes('Try again'))
  if (!alert?.textContent?.includes('Authentication is unavailable') || !alert.textContent.includes('Account service unavailable.')) throw new Error('Unavailable state was not announced')
  if (!button || [...document.querySelectorAll('button')].some(node => node.textContent?.includes('Sign in with Google'))) throw new Error('Unavailable state did not replace sign-in controls')
  button.click(); await tick()
  if (refreshCount !== 1) throw new Error('Retry did not refresh policy and session')
  document.getElementById('result')!.textContent = 'PASS: unavailable announcement; controls hidden; retry'
}
void run().catch(error => { document.getElementById('result')!.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}` })

