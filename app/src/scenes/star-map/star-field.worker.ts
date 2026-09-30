import { StarFieldReveal, initStarFieldReveal } from './starFieldReveal';
import { createGradientNoiseFrame } from './gradient-noise';
import type { StarFrame, StarWorkerRequest, StarWorkerResponse } from './star-field-protocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<StarWorkerRequest>) => void) | null;
  postMessage(message: StarWorkerResponse, transfer?: Transferable[]): void;
};
let painter: StarFieldReveal | undefined;
let output: OffscreenCanvas | undefined;
let frame: StarFrame = {};

if (typeof document === 'undefined') scope.onmessage = (event) => {
  void handle(event.data).catch((error: unknown) => {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  });
};

// The ESM worker bundle also supplies the identical main-thread fallback.
// Loading it in a Window must not install a global message handler.
export function createStarFieldFallback(canvas: HTMLCanvasElement, sourceUrl: string) {
  return initStarFieldReveal({ canvas, sourceUrl, autoplay: false, createNoiseFrame: createGradientNoiseFrame });
}

async function handle(message: StarWorkerRequest) {
  if (message.type === 'init') {
    const response = await fetch(message.sourceUrl, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`Star source HTTP ${response.status}`);
    const image = await createImageBitmap(await response.blob());
    try {
      output = new OffscreenCanvas(image.width, image.height);
      painter = new StarFieldReveal({
        canvas: output, sourceUrl: message.sourceUrl, autoplay: false,
        createCanvas: (width, height) => new OffscreenCanvas(width, height),
        createNoiseFrame: createGradientNoiseFrame,
        viewport: () => frame.viewport
      });
      painter.prepareSource(image);
      if (!painter.ready || !painter.ctx || !('filter' in painter.ctx)) {
        throw new Error('Star worker 2D filters unavailable');
      }
    } finally { image.close(); }
    scope.postMessage({ type: 'ready' });
    return;
  }
  if (!painter?.ready || !output) throw new Error('Star worker not initialized');
  frame = message.frame;
  painter.renderBackground(frame);
  const bitmap = output.transferToImageBitmap();
  scope.postMessage({ type: 'frame', generation: message.generation, frameId: message.frameId, bitmap }, [bitmap]);
}
