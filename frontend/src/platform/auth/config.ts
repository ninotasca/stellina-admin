import { publicConfig } from '../config/index'
import { safeReturnPath } from '@ninotasca/web-platform/auth'

export const authConfig = Object.freeze({
  siteId: publicConfig.manifest.auth.siteKey,
  productName: publicConfig.manifest.branding.displayName,
  postLoginPath: publicConfig.manifest.branding.postLoginPath,
  magicLogin: publicConfig.switches.enableMagicLoginUi,
  backgroundImage: '/brand/Stellina-site-selection-company-1.jpg',
})

export function safeReturnTo(value: string | null | undefined): string {
  return safeReturnPath(value, authConfig.postLoginPath)
}
