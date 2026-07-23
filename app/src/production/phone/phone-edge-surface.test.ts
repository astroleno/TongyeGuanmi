import { describe, expect, it } from 'vitest';
import {
  PHONE_EDGE_SURFACE_BY_SCENE,
  PHONE_PATTERN_TERMINAL_EDGE_SURFACE,
  phoneEdgeSurfaceForScene,
  type PhoneEdgeScene
} from './phone-edge-surface';

describe('phone edge surface contract', () => {
  it('keeps the accepted baseline tokens unchanged', () => {
    expect(phoneEdgeSurfaceForScene('hero')).toBe('#07110e');
    expect(phoneEdgeSurfaceForScene('pattern')).toBe('#d9c08f');
    expect(phoneEdgeSurfaceForScene('figure2')).toBe('#e2dac9');
    expect(phoneEdgeSurfaceForScene('brand')).toBe('#ede4d2');
    expect(phoneEdgeSurfaceForScene('figure3')).toBe('#ede4d2');
    expect(phoneEdgeSurfaceForScene('services')).toBe('#ede4d2');
    expect(phoneEdgeSurfaceForScene('ttg')).toBe('#080d10');
    expect(phoneEdgeSurfaceForScene('lab')).toBe('#ede4d2');
  });

  it('changes only Pattern in the v47 terminal profile', () => {
    expect(phoneEdgeSurfaceForScene(
      'pattern',
      'pattern-terminal'
    )).toBe(PHONE_PATTERN_TERMINAL_EDGE_SURFACE);
    expect(PHONE_PATTERN_TERMINAL_EDGE_SURFACE).toBe('#8f7f61');

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
      expect(phoneEdgeSurfaceForScene(scene, 'pattern-terminal'))
        .toBe(PHONE_EDGE_SURFACE_BY_SCENE[scene]);
    }
  });
});
