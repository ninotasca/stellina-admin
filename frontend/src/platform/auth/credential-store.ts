export type CredentialSnapshot = Readonly<{
  accessToken: string | null; csrfToken: string | null; expiresAt: number | null; generation: number;
}>

let snapshot: CredentialSnapshot = Object.freeze({ accessToken: null, csrfToken: null, expiresAt: null, generation: 0 })
const listeners = new Set<(value: CredentialSnapshot) => void>()
const protectedCacheCleanups = new Set<() => void>()

export function credentialSnapshot(): CredentialSnapshot { return snapshot }
export function installCredential(accessToken: string, csrfToken: string, expiresAt: string): CredentialSnapshot {
  const expiry = Date.parse(expiresAt)
  if (!accessToken || !csrfToken || !Number.isFinite(expiry)) throw new Error('Invalid in-memory credential')
  snapshot = Object.freeze({ accessToken, csrfToken, expiresAt: expiry, generation: snapshot.generation + 1 })
  for (const listener of listeners) listener(snapshot)
  return snapshot
}
export function clearCredential(expectedGeneration?: number): boolean {
  if (expectedGeneration !== undefined && expectedGeneration !== snapshot.generation) return false
  snapshot = Object.freeze({ accessToken: null, csrfToken: null, expiresAt: null, generation: snapshot.generation + 1 })
  for (const cleanup of protectedCacheCleanups) cleanup()
  for (const listener of listeners) listener(snapshot)
  return true
}
export function subscribeCredential(listener: (value: CredentialSnapshot) => void): () => void {
  listeners.add(listener); return () => listeners.delete(listener)
}
export function registerProtectedCacheCleanup(cleanup: () => void): () => void {
  protectedCacheCleanups.add(cleanup); return () => protectedCacheCleanups.delete(cleanup)
}
