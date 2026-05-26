export type BackdropVariant = 'static' | 'video' | 'shader'

export type SceneCtaAction = 'scroll' | 'expand' | 'modal' | 'submit' | 'external' | 'disabled'

export type EmotionalTextMode = 'none' | 'emerge' | 'scatter' | 'align' | 'settle'

export type LineBreakPolicy = 'manual' | 'native' | 'precomputed'

export type PretextMode = 'none' | 'inspired' | 'h5-runtime' | 'mp-runtime-poc'

export type EmotionalPulse = {
  id: number
  x: number
  y: number
  active: boolean
}

export type SceneRegistryItem = {
  id: string
  order: number
  component: string
  eyebrow: string
  title: string
  titleLines?: string[]
  titleMaxLines?: number
  subtitle?: string
  body?: string[]
  cards?: number
  ctaLabel?: string
  ctaAction?: SceneCtaAction
  ctaTarget?: string
  prototypeRef?: string
  backdropMood: string
  shaderScene?: number
  textFx?: {
    mode: EmotionalTextMode
    target: 'title' | 'keywords' | 'steps'
    lineBreakPolicy?: LineBreakPolicy
  }
  screenshotCheck: string
}

export type ModalContent = {
  id: string
  title: string
  summary: string
  points: string[]
}

export type SceneBackdropProps = {
  sceneId: string
  sceneIndex: number
  active: boolean
  progress: number
  variant: BackdropVariant
}
