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

export function applyLayerVisibility(layer: LayerHandle, state: LayerVisibilityState): void {
  layer.setVisibility(state);
  const element = layer.element;
  if (!element) {
    return;
  }
  element.style.opacity = String(state.opacity);
  element.style.visibility = state.visible ? 'visible' : 'hidden';
  element.style.pointerEvents = state.pointerEvents;
  element.style.clipPath = '';
  element.style.removeProperty('-webkit-clip-path');
  if (typeof element.querySelectorAll === 'function') {
    element.querySelectorAll<HTMLElement>('[data-transition-clip]').forEach((target) => {
      target.style.clipPath = '';
      target.style.removeProperty('-webkit-clip-path');
      target.style.opacity = '';
      target.style.visibility = '';
    });
  }
  element.inert = state.inert;
  element.setAttribute('aria-hidden', state.inert ? 'true' : 'false');
  element.dataset.visible = String(state.visible && state.opacity > 0.001);
  element.dataset.interactable = String(!state.inert && state.pointerEvents === 'auto');
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
