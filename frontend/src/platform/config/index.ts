import type { ApplicationDefinition, BuildEnvironment, ClientLogLevel, PublicConfig as PlatformPublicConfig } from '@ninotasca/web-platform/config'
export type { BuildEnvironment, ClientLogLevel }
export type CoreCapability = 'auth' | 'platform-administration'
export type ApplicationManifest = ApplicationDefinition & Readonly<{
  api: ApplicationDefinition['api'] & Readonly<{ productNamespace: string; coreCapabilities: readonly CoreCapability[] }>
}>
export type PublicConfig = Omit<PlatformPublicConfig<Readonly<{
  showBuildInfo: boolean; enableMagicLoginUi: boolean; includeTestBookings: boolean
}>>, 'manifest'> & Readonly<{
  manifest: ApplicationManifest
  readonly siteId: string
}>
export const publicConfig: PublicConfig = __STELLINA_PUBLIC_CONFIG__
