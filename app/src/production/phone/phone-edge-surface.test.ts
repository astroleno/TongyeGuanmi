import { describe, expect, it } from 'vitest';
import {
  PHONE_EDGE_SURFACE_BY_SCENE,
  PHONE_PATTERN_TERMINAL_EDGE_SURFACE,
  phoneEdgeSurfaceForScene,
  type PhoneEdgeScene
} from './phone-story/presentation';

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
    expect(phoneEdgeSurfaceForScene('ph')).toBe('#9889a5');
    expect(phoneEdgeSurfaceForScene('education')).toBe('#ede4d2');
    expect(phoneEdgeSurfaceForScene('crane')).toBe('#ede4d2');
    expect(phoneEdgeSurfaceForScene('contact')).toBe('#ede4d2');
  });

  it('has no validation-route branch in the production edge contract', () => {
    expect(PHONE_PATTERN_TERMINAL_EDGE_SURFACE).toBe('#d9c08f');
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
      'lab',
      'ph',
      'education',
      'crane',
      'contact'
    ];
    for (const scene of unaffectedScenes) {
      expect(phoneEdgeSurfaceForScene(scene))
        .toBe(PHONE_EDGE_SURFACE_BY_SCENE[scene]);
    }
  });
});
