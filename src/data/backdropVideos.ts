export type BackdropVideoClip = {
  id: string
  src: string
  poster: string
}

export type SceneBackdropVideo = {
  clip: BackdropVideoClip
  playVideo: boolean
  veilOpacity: number
  hazeOpacity: number
  tone: 'calm' | 'entry' | 'ring' | 'pipeline' | 'conversion'
}

const VIDEO_BASE = normalizeVideoBase(import.meta.env.VITE_BACKDROP_VIDEO_BASE)

export const backdropVideoClips = {
  entry: videoClip('Video-1779900976442'),
  hero: videoClip('Video-1779901399745'),
  meaning: videoClip('Video-1779896236909'),
  fieldMap: videoClip('Video-1779902786466'),
  organization: videoClip('Video-1779901848500'),
  canvasAgent: videoClip('Video-1779901413161'),
  videoPipeline: videoClip('Video-1779901417466'),
  personal: videoClip('Video-1779901851956'),
  gallery: videoClip('Video-1779901884179')
} satisfies Record<string, BackdropVideoClip>

export const sceneBackdropVideos: Record<string, SceneBackdropVideo> = {
  entry: {
    clip: backdropVideoClips.entry,
    playVideo: true,
    veilOpacity: 0.48,
    hazeOpacity: 0.22,
    tone: 'entry'
  },
  hero: {
    clip: backdropVideoClips.hero,
    playVideo: true,
    veilOpacity: 0.46,
    hazeOpacity: 0.20,
    tone: 'calm'
  },
  about: {
    clip: backdropVideoClips.meaning,
    playVideo: true,
    veilOpacity: 0.56,
    hazeOpacity: 0.28,
    tone: 'ring'
  },
  'field-map': {
    clip: backdropVideoClips.fieldMap,
    playVideo: true,
    veilOpacity: 0.52,
    hazeOpacity: 0.24,
    tone: 'calm'
  },
  organization: {
    clip: backdropVideoClips.organization,
    playVideo: true,
    veilOpacity: 0.54,
    hazeOpacity: 0.26,
    tone: 'calm'
  },
  'canvas-agent': {
    clip: backdropVideoClips.canvasAgent,
    playVideo: true,
    veilOpacity: 0.52,
    hazeOpacity: 0.26,
    tone: 'pipeline'
  },
  'video-pipeline': {
    clip: backdropVideoClips.videoPipeline,
    playVideo: true,
    veilOpacity: 0.56,
    hazeOpacity: 0.30,
    tone: 'pipeline'
  },
  personal: {
    clip: backdropVideoClips.personal,
    playVideo: true,
    veilOpacity: 0.54,
    hazeOpacity: 0.26,
    tone: 'calm'
  },
  method: {
    clip: backdropVideoClips.gallery,
    playVideo: true,
    veilOpacity: 0.58,
    hazeOpacity: 0.32,
    tone: 'calm'
  },
  projects: {
    clip: backdropVideoClips.gallery,
    playVideo: true,
    veilOpacity: 0.64,
    hazeOpacity: 0.38,
    tone: 'ring'
  },
  'service-packages': {
    clip: backdropVideoClips.gallery,
    playVideo: true,
    veilOpacity: 0.72,
    hazeOpacity: 0.48,
    tone: 'conversion'
  },
  lead: {
    clip: backdropVideoClips.gallery,
    playVideo: true,
    veilOpacity: 0.76,
    hazeOpacity: 0.54,
    tone: 'conversion'
  }
}

export function getSceneBackdropVideo(sceneId: string) {
  return sceneBackdropVideos[sceneId] || sceneBackdropVideos.hero
}

function videoClip(id: string): BackdropVideoClip {
  return {
    id,
    src: `${VIDEO_BASE}/bg/${id}_bg540_soft.mp4`,
    poster: `${VIDEO_BASE}/poster/${id}_poster.jpg`
  }
}

function normalizeVideoBase(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '/static/video'
  return value.trim().replace(/\/$/, '')
}
