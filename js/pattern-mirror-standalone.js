import { createPatternBloomScene } from './pattern-mirror-stage.js';

export function initStandalonePatternBloom({
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  const canvas = documentRef?.querySelector?.('[data-mirror-stage-canvas], [data-bloom-canvas]');
  if (!canvas || canvas.dataset.patternBloomMounted === 'true') return null;

  canvas.dataset.patternBloomMounted = 'true';
  const scrollStage = documentRef.querySelector('[data-mirror-stage-scroll]')
    ?? documentRef.querySelector('.bloom-page')
    ?? documentRef.body;
  const scene = createPatternBloomScene({ canvas, scrollStage, reducedMotionProgress: 1 });

  windowRef?.addEventListener?.('pagehide', scene.destroy, { once: true });
  scene.start().catch((error) => {
    console.error('Failed to start mirror stage', error);
    scene.destroy();
  });
  return scene;
}

if (typeof document !== 'undefined') {
  initStandalonePatternBloom();
}
