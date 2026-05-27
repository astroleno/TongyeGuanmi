import type { BackdropVariant, PretextMode } from '@/types/scene'

export const LEAD_API_MODE = normalizeLeadMode(import.meta.env.VITE_LEAD_API_MODE)

export const DEFAULT_BACKDROP_VARIANT = normalizeBackdropVariant(
  import.meta.env.VITE_BACKDROP_VARIANT
)

export const PRETEXT_MODE: PretextMode = normalizePretextMode(import.meta.env.VITE_PRETEXT_MODE)

export const SHADER_POC_RESULT = 'mp-runtime-shader-snapshot' as const

export const SHADER_SCENE_MAP: Record<string, number> = {
  entry: 0,
  hero: 0,
  about: 1,
  'field-map': 2,
  organization: 3,
  'canvas-agent': 4,
  'video-pipeline': 5,
  personal: 6,
  method: 7,
  projects: 8,
  'service-packages': 8,
  lead: 8
}

function normalizeLeadMode(value: unknown): 'mock' | 'unicloud' | 'http' {
  if (value === 'unicloud' || value === 'http') return value
  return 'mock'
}

function normalizeBackdropVariant(value: unknown): BackdropVariant {
  if (value === 'shader') return 'shader'
  if (value === 'static') return 'static'
  if (value === 'video') return 'video'

  return 'shader'
}

function normalizePretextMode(value: unknown): PretextMode {
  if (value === 'none' || value === 'off' || value === false) return 'none'
  if (value === 'h5-runtime') return 'h5-runtime'
  if (value === 'mp-runtime-poc') return 'inspired'
  return 'inspired'
}
