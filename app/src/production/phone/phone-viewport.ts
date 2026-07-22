export const PHONE_STAGE_SCROLL_VIEWPORTS = 4.8;

export type PhoneViewport = Readonly<{
  width: number;
  height: number;
}>;

export type PhoneStageGeometry = Readonly<{
  width: number;
  height: number;
  railHeight: number;
  orientation: 'portrait' | 'landscape';
}>;

export function phoneStageGeometry(viewport: PhoneViewport): PhoneStageGeometry {
  const width = Math.max(1, Math.round(viewport.width));
  const height = Math.max(1, Math.round(viewport.height));
  return {
    width,
    height,
    railHeight: Math.round(height * PHONE_STAGE_SCROLL_VIEWPORTS),
    orientation: height >= width ? 'portrait' : 'landscape'
  };
}

/**
 * Keep a fixed presentation surface large enough for an iOS toolbar collapse
 * without changing the scroll rail geometry mid-gesture. A true orientation
 * or width change resets the retained coverage to the new viewport.
 */
export function phoneStageCoverageHeight(
  previousHeight: number,
  viewportHeight: number,
  reset = false
): number {
  const nextHeight = Math.max(1, Math.ceil(viewportHeight));
  return reset
    ? nextHeight
    : Math.max(Math.max(1, Math.ceil(previousHeight)), nextHeight);
}

/**
 * Express the visible viewport's lower edge in layout-viewport coordinates.
 * Safari can move the visual viewport down while its toolbar animates, so its
 * height alone is not a sufficient paint-coverage measurement.
 */
export function phoneViewportCoverageBottom(
  viewportHeight: number,
  viewportOffsetTop = 0
): number {
  const height = Number.isFinite(viewportHeight)
    ? Math.max(1, viewportHeight)
    : 1;
  const offsetTop = Number.isFinite(viewportOffsetTop)
    ? Math.max(0, viewportOffsetTop)
    : 0;
  return Math.max(1, Math.ceil(offsetTop + height));
}

export function readPhoneViewport(): PhoneViewport {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight
  };
}

export function applyPhoneStageGeometry(root: HTMLElement, geometry: PhoneStageGeometry): void {
  root.style.setProperty('--phone-live-height', `${geometry.height}px`);
  root.style.setProperty('--phone-live-width', `${geometry.width}px`);
  root.style.setProperty('--phone-stage-rail-height', `${geometry.railHeight}px`);
  root.dataset.phoneViewport = `${geometry.width}x${geometry.height}`;
  root.dataset.phoneOrientation = geometry.orientation;
}
