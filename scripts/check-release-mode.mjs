const releaseEnabled = process.env.TONGYE_RELEASE === '1' || process.env.TONGYE_RELEASE === 'true'
const leadMode = process.env.VITE_LEAD_API_MODE || 'mock'

if (!releaseEnabled) {
  console.log('[release-check] skipped; set TONGYE_RELEASE=1 for release validation.')
  process.exit(0)
}

if (leadMode === 'mock') {
  console.error('[release-check] VITE_LEAD_API_MODE=mock is not allowed for release builds.')
  console.error('[release-check] Use VITE_LEAD_API_MODE=unicloud or VITE_LEAD_API_MODE=http.')
  process.exit(1)
}

if (leadMode !== 'unicloud' && leadMode !== 'http') {
  console.error(`[release-check] Unsupported VITE_LEAD_API_MODE=${leadMode}.`)
  process.exit(1)
}

console.log(`[release-check] ok: VITE_LEAD_API_MODE=${leadMode}`)
