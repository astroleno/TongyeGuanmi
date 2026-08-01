import { describe, expect, it } from 'vitest';
import {
  PHONE_FIGURE2_DISTANCE_OPTIONS,
  phoneFigure2DistanceField
} from './phone';

describe('clean Figure2 → Proof depth transition leaf', () => {
  it('keeps the depth field, accepted mask source, and terminal camera transform', () => {
    const field = phoneFigure2DistanceField({ width: 390, height: 844 });
    expect(PHONE_FIGURE2_DISTANCE_OPTIONS).toMatchObject({
      segmentId: 'figure2-distance-expand',
      surfaceId: 'fx:figure2-distance-expand', grade: 'edge-only'
    });
    expect(field).toMatchObject({
      kind: 'depth', seed: 'figure2-distance-expand',
      transform: { viewport: { width: 390, height: 844 } }
    });
    expect(field.depthSrc).toMatch(/figure2-middle-depth\.webp$/);
  });
});
