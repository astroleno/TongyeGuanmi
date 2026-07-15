export type TransitionLayerElevation = {
  elevate(): void;
  restore(): void;
};

export function createTransitionLayerElevation(element: HTMLElement | null, zIndex = 70): TransitionLayerElevation {
  const previousZIndex = element?.style.zIndex ?? '';
  let elevated = false;
  return {
    elevate() {
      if (!element || elevated) {
        return;
      }
      element.style.zIndex = String(zIndex);
      element.dataset.r4TransitionElevated = 'true';
      elevated = true;
    },
    restore() {
      if (!element || !elevated) {
        return;
      }
      element.style.zIndex = previousZIndex;
      delete element.dataset.r4TransitionElevated;
      elevated = false;
    }
  };
}
