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

const VIDEO_BASE = '/static/video'

export const backdropVideoClips = {
  calm: videoClip('Video-1779901399745'),
  entryFlow: videoClip('Video-1779900976442'),
  ringField: videoClip('Video-1779896236909'),
  pipeline: videoClip('Video-1779901417466')
} satisfies Record<string, BackdropVideoClip>

export const sceneBackdropVideos: Record<string, SceneBackdropVideo> = {
  entry: {
    clip: backdropVideoClips.entryFlow,
    playVideo: true,
    veilOpacity: 0.48,
    hazeOpacity: 0.22,
    tone: 'entry'
  },
  hero: {
    clip: backdropVideoClips.calm,
    playVideo: true,
    veilOpacity: 0.46,
    hazeOpacity: 0.20,
    tone: 'calm'
  },
  about: {
    clip: backdropVideoClips.ringField,
    playVideo: true,
    veilOpacity: 0.56,
    hazeOpacity: 0.28,
    tone: 'ring'
  },
  'field-map': {
    clip: backdropVideoClips.calm,
    playVideo: true,
    veilOpacity: 0.52,
    hazeOpacity: 0.24,
    tone: 'calm'
  },
  organization: {
    clip: backdropVideoClips.calm,
    playVideo: true,
    veilOpacity: 0.54,
    hazeOpacity: 0.26,
    tone: 'calm'
  },
  'canvas-agent': {
    clip: backdropVideoClips.pipeline,
    playVideo: true,
    veilOpacity: 0.52,
    hazeOpacity: 0.26,
    tone: 'pipeline'
  },
  'video-pipeline': {
    clip: backdropVideoClips.pipeline,
    playVideo: true,
    veilOpacity: 0.56,
    hazeOpacity: 0.30,
    tone: 'pipeline'
  },
  personal: {
    clip: backdropVideoClips.calm,
    playVideo: true,
    veilOpacity: 0.54,
    hazeOpacity: 0.26,
    tone: 'calm'
  },
  method: {
    clip: backdropVideoClips.calm,
    playVideo: true,
    veilOpacity: 0.58,
    hazeOpacity: 0.32,
    tone: 'calm'
  },
  projects: {
    clip: backdropVideoClips.ringField,
    playVideo: true,
    veilOpacity: 0.64,
    hazeOpacity: 0.38,
    tone: 'ring'
  },
  'service-packages': {
    clip: backdropVideoClips.calm,
    playVideo: false,
    veilOpacity: 0.72,
    hazeOpacity: 0.48,
    tone: 'conversion'
  },
  lead: {
    clip: backdropVideoClips.calm,
    playVideo: false,
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
