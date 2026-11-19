import { createContext, useContext } from 'react'
import type { AuthSessionContext, AuthStatus, PublicAuthConfig, User } from '../../domain/auth'
import type { DiagnosticError } from '../diagnostics/index'

export type AuthContextValue = {
  status: AuthStatus; context: AuthSessionContext | null; message: string | null; failure: DiagnosticError | null;
  policy: PublicAuthConfig; policyLoading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void>; magicLogin: () => Promise<void>;
  user: User | null; loading: boolean; logout: () => Promise<void>; isAuthenticated: boolean; isAdmin: boolean;
  googleLoginEnabled: boolean; magicLoginEnabled: boolean;
}
export const AuthContext = createContext<AuthContextValue | null>(null)
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
