export const PORTRAIT_SPIKE_QUERY = 'portrait-spike';
export const PORTRAIT_PREVIEW_VERSION_QUERY = 'v';
export const PORTRAIT_PREVIEW_VERSION = '16';
export const PORTRAIT_PREVIOUS_VERSION = '17';
export const PORTRAIT_CURRENT_VERSION = '18';

/**
 * These routes are intentionally query-gated experiments. They let a physical
 * device compare the existing Stage/Director ownership model with one native
 * document-scroll presentation without changing the production route.
 */
export type PortraitSpikeRoute = 'a' | 'b';

export function portraitSpikeRouteForSearch(search: string): PortraitSpikeRoute | undefined {
  const searchParams = new URLSearchParams(search);
  const previewVersion = searchParams.get(PORTRAIT_PREVIEW_VERSION_QUERY);
  if (
    previewVersion === PORTRAIT_PREVIEW_VERSION
    || previewVersion === PORTRAIT_PREVIOUS_VERSION
    || previewVersion === PORTRAIT_CURRENT_VERSION
  ) {
    return 'b';
  }
  const value = searchParams.get(PORTRAIT_SPIKE_QUERY);
  return value === 'a' || value === 'b' ? value : undefined;
}

export function portraitTrackProgress(
  trackTop: number,
  trackHeight: number,
  viewportHeight: number
): number {
  const scrollRange = Math.max(1, trackHeight - Math.max(1, viewportHeight));
  return Math.min(1, Math.max(0, -trackTop / scrollRange));
}
