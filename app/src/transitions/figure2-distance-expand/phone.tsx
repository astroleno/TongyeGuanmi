import type { InkDepthTransform } from '../shared/inkField';
import { createPhoneInkLeaf } from '../shared/phoneInkLeaf';

const FIGURE2_DEPTH_IMAGE = new URL(
  '../../../../assets/figure2-middle-depth.webp', import.meta.url
).href;
const FIGURE2_DEPTH_MASK_ATLAS = new URL(
  '../../../../assets/figure2-depth-mask-atlas.webp', import.meta.url
).href;
const FIGURE2_ASPECT = 16 / 9;

function terminalDepthTransform(
  viewport: Readonly<{ width: number; height: number }>
): InkDepthTransform {
  const ratio = viewport.width / viewport.height;
  const cover = ratio >= FIGURE2_ASPECT
    ? {
        x: 0,
        y: (viewport.height - viewport.width / FIGURE2_ASPECT) / 2,
        width: viewport.width,
        height: viewport.width / FIGURE2_ASPECT
      }
    : {
        x: (viewport.width - viewport.height * FIGURE2_ASPECT) / 2,
        y: 0,
        width: viewport.height * FIGURE2_ASPECT,
        height: viewport.height
      };
  return {
    viewport,
    cover,
    camera: {
      scale: 1.142,
      translateX: 0,
      translateY: -34,
      originX: .5,
      originY: .56
    }
  };
}

export function phoneFigure2DistanceField(
  viewport: Readonly<{ width: number; height: number }>
) {
  return Object.freeze({
    kind: 'depth' as const,
    depthSrc: FIGURE2_DEPTH_IMAGE,
    seed: 'figure2-distance-expand',
    transform: terminalDepthTransform(viewport)
  });
}

export const PHONE_FIGURE2_DISTANCE_OPTIONS = Object.freeze({
  segmentId: 'figure2-distance-expand',
  surfaceId: 'fx:figure2-distance-expand' as const,
  field: phoneFigure2DistanceField,
  depthMaskAtlasSrc: FIGURE2_DEPTH_MASK_ATLAS,
  grade: 'edge-only' as const,
  canvasClassName: 'r4-figure2-proof-ink-canvas',
  portraitInk: 'figure2-proof'
});

export const PhoneFigure2DistanceExpandTransition = createPhoneInkLeaf(
  PHONE_FIGURE2_DISTANCE_OPTIONS
);

export default PhoneFigure2DistanceExpandTransition;
export const phoneSegmentId = 'figure2-distance-expand' as const;
