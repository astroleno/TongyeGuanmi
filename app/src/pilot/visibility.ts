import type { LayerHandle, LayerVisibilityState } from '../story/types';

export function hiddenVisibility(): LayerVisibilityState {
  return {
    mounted: true,
    visible: false,
    inert: true,
    opacity: 0,
    pointerEvents: 'none'
  };
}

export function holdVisibility(interactable = true): LayerVisibilityState {
  return {
    mounted: true,
    visible: true,
    inert: !interactable,
    opacity: 1,
    pointerEvents: interactable ? 'auto' : 'none'
  };
}

export function fadeVisibility(opacity: number): LayerVisibilityState {
  const clamped = Math.min(1, Math.max(0, opacity));
  return {
    mounted: true,
    visible: clamped > 0.001,
    inert: true,
    opacity: clamped,
    pointerEvents: 'none'
  };
}

function visibilityEquals(left: LayerVisibilityState, right: LayerVisibilityState): boolean {
  return left.mounted === right.mounted
    && left.visible === right.visible
    && left.inert === right.inert
    && left.opacity === right.opacity
    && left.pointerEvents === right.pointerEvents;
}

export function applyLayerVisibility(layer: LayerHandle, state: LayerVisibilityState): void {
  if (visibilityEquals(layer.visibility, state)) {
    return;
  }
  layer.setVisibility(state);
}

export function smoothStep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export function range01(value: number, start: number, end: number): number {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }
  return Math.min(1, Math.max(0, (value - start) / (end - start)));
}
