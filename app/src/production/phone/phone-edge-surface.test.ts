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
      'proof'
    ];
    for (const scene of unaffectedScenes) {
      expect(phoneEdgeSurfaceForScene(scene, 'pattern-terminal'))
        .toBe(PHONE_EDGE_SURFACE_BY_SCENE[scene]);
    }
  });
});
