export type BuildEnvironment = 'development' | 'staging' | 'production'
export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type CoreCapability = 'auth' | 'platform-administration'
export interface ApplicationManifest {
  readonly schemaVersion: 1
  readonly applicationId: string
  readonly api: Readonly<{ owner: 'unoventi-api'; productNamespace: string; coreCapabilities: readonly CoreCapability[] }>
  readonly auth: Readonly<{ siteKey: string }>
  readonly branding: Readonly<{ displayName: string; logoPath: string; postLoginPath: string }>
}
export interface PublicConfig {
  readonly manifest: ApplicationManifest
  readonly environment: BuildEnvironment
  readonly clientLogLevel: ClientLogLevel
  readonly apiBaseUrl: string
  readonly siteId: string
  readonly supabaseUrl: string
  readonly supabasePublishableKey: string
  readonly switches: Readonly<{ showBuildInfo: boolean; enableMagicLoginUi: boolean; includeTestBookings: boolean }>
  readonly registryRevision: string
  readonly buildVersion: string
}
export const publicConfig: PublicConfig = __STELLINA_PUBLIC_CONFIG__
