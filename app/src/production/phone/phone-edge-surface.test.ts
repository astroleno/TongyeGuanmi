import { describe, expect, it } from 'vitest';
import {
  PHONE_EDGE_SURFACE_BY_SCENE,
  PHONE_PATTERN_TERMINAL_EDGE_SURFACE,
  phoneEdgeSurfaceForScene,
  type PhoneEdgeScene
} from './phone-edge-surface';

describe('phone edge surface contract', () => {
  it('publishes the accepted terminal pixel for every Pattern route', () => {
    expect(phoneEdgeSurfaceForScene('hero')).toBe('#07110e');
    expect(phoneEdgeSurfaceForScene('pattern')).toBe(
      PHONE_PATTERN_TERMINAL_EDGE_SURFACE
    );
    expect(phoneEdgeSurfaceForScene('figure2')).toBe('#e2dac9');
    expect(phoneEdgeSurfaceForScene('brand')).toBe('#ede4d2');
    expect(phoneEdgeSurfaceForScene('figure3')).toBe('#ede4d2');
    expect(phoneEdgeSurfaceForScene('services')).toBe('#ede4d2');
    expect(phoneEdgeSurfaceForScene('ttg')).toBe('#080d10');
    expect(phoneEdgeSurfaceForScene('lab')).toBe('#ede4d2');
  });

  it('has no validation-route branch in the production edge contract', () => {
    expect(PHONE_PATTERN_TERMINAL_EDGE_SURFACE).toBe('#8f7f61');
    expect(PHONE_EDGE_SURFACE_BY_SCENE.pattern).toBe(
      PHONE_PATTERN_TERMINAL_EDGE_SURFACE
    );

    const unaffectedScenes: readonly PhoneEdgeScene[] = [
      'hero',
      'star',
      'aod',
      'method',
      'figure2',
      'proof',
      'brand',
      'figure3',
      'services',
      'ttg',
      'lab'
    ];
    for (const scene of unaffectedScenes) {
      expect(phoneEdgeSurfaceForScene(scene))
        .toBe(PHONE_EDGE_SURFACE_BY_SCENE[scene]);
    }
  });
});
