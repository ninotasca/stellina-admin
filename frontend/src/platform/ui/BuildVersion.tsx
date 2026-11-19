import { publicConfig } from '../config/index'

export default function BuildVersion() {
  if (!publicConfig.switches.showBuildInfo) return null
  const version = publicConfig.buildVersion
  return (
    <small
      aria-label={`Build ${version}`}
      title="Git build version"
      style={{
        position: 'fixed', right: 8, bottom: 5, zIndex: 100,
        borderRadius: 4, padding: '2px 5px', background: 'rgb(255 255 255 / 82%)',
        color: '#64748b', font: '10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
        pointerEvents: 'none', userSelect: 'text',
      }}
    >
      build {version}
    </small>
  )
}
