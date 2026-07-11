import { describe, expect, it, vi } from 'vitest';
import type { LayerHandle, LayerVisibilityState } from '../story/types';
import { applyLayerVisibility, hiddenVisibility, holdVisibility } from './visibility';

describe('applyLayerVisibility', () => {
  it('skips duplicate visibility commits during animation frames', () => {
    let visibility: LayerVisibilityState = hiddenVisibility();
    const setVisibility = vi.fn((next: LayerVisibilityState) => {
      visibility = next;
    });
    const layer: LayerHandle = {
      scene: 'hero',
      role: 'current',
      element: null,
      get visibility() {
        return visibility;
      },
      setVisibility,
      dispose() {}
    };

    applyLayerVisibility(layer, holdVisibility(false));
    applyLayerVisibility(layer, holdVisibility(false));

    expect(setVisibility).toHaveBeenCalledOnce();
  });
});
