import type { LayerVisibilityState, VisibilityPredicate } from './types';

export type SyntheticVisibilitySnapshot = Partial<LayerVisibilityState> & {
  display?: 'block' | 'none';
  visibility?: 'visible' | 'hidden';
};

export const isVisuallyVisible: VisibilityPredicate = (state) => {
  return state.mounted && state.visible && state.opacity > 0.001;
};

export const isInteractable: VisibilityPredicate = (state) => {
  return isVisuallyVisible(state) && !state.inert && state.pointerEvents === 'auto';
};

export function fromSyntheticVisibility(snapshot: SyntheticVisibilitySnapshot): LayerVisibilityState {
  const display = snapshot.display ?? 'block';
  const cssVisibility = snapshot.visibility ?? 'visible';
  const opacity = snapshot.opacity ?? 1;
  const mounted = snapshot.mounted ?? display !== 'none';
  const visible = snapshot.visible ?? (display !== 'none' && cssVisibility !== 'hidden');
  const inert = snapshot.inert ?? false;
  const pointerEvents = snapshot.pointerEvents ?? (inert ? 'none' : 'auto');

  return {
    mounted,
    visible,
    inert,
    opacity,
    pointerEvents
  };
}

export function fromElementVisibility(element: Element): LayerVisibilityState {
  const htmlElement = element as HTMLElement;
  const canReadComputedStyle = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function';
  const computed = canReadComputedStyle ? window.getComputedStyle(htmlElement) : undefined;
  const display = computed?.display ?? htmlElement.style.display;
  const visibility = computed?.visibility ?? htmlElement.style.visibility;
  const opacityValue = computed?.opacity ?? htmlElement.style.opacity;
  const opacity = opacityValue === '' ? 1 : Number.parseFloat(opacityValue);
  const inert = htmlElement.inert || htmlElement.getAttribute('aria-hidden') === 'true';
  const pointerEvents = computed?.pointerEvents === 'none' || htmlElement.style.pointerEvents === 'none' ? 'none' : 'auto';

  return fromSyntheticVisibility({
    mounted: htmlElement.isConnected,
    display: display === 'none' ? 'none' : 'block',
    visibility: visibility === 'hidden' ? 'hidden' : 'visible',
    opacity: Number.isFinite(opacity) ? opacity : 1,
    inert,
    pointerEvents
  });
}
