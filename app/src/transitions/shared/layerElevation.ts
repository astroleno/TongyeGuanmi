export type TransitionLayerElevation = {
  elevate(): void;
  restore(): void;
};

export function createTransitionLayerElevation(element: HTMLElement | null, zIndex = 70): TransitionLayerElevation {
  const previousZIndex = element?.style.zIndex ?? '';
  return {
    elevate() {
      if (!element) {
        return;
      }
      element.style.zIndex = String(zIndex);
      element.dataset.r4TransitionElevated = 'true';
    },
    restore() {
      if (!element) {
        return;
      }
      element.style.zIndex = previousZIndex;
      delete element.dataset.r4TransitionElevated;
    }
  };
}
