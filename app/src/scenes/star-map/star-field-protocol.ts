import type { RenderBackgroundOptions } from './starFieldReveal';

export type StarFrame = RenderBackgroundOptions & {
  viewport?: { width: number; height: number };
};
export type StarWorkerRequest =
  | { type: 'init'; sourceUrl: string }
  | { type: 'render'; generation: number; frameId: number; frame: StarFrame };
export type StarWorkerResponse =
  | { type: 'ready' }
  | { type: 'frame'; generation: number; frameId: number; bitmap: ImageBitmap }
  | { type: 'error'; message: string };
