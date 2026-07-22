export const PORTRAIT_SPIKE_QUERY = 'portrait-spike';
export const PORTRAIT_PREVIEW_VERSION_QUERY = 'v';
export const PORTRAIT_CURRENT_VERSION = '45';
export const PORTRAIT_SUPPORTED_VERSIONS = [
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '40',
  '42',
  '43',
  '44',
  PORTRAIT_CURRENT_VERSION
] as const;

/**
 * These routes are intentionally query-gated experiments. They let a physical
 * device compare the existing Stage/Director ownership model with one native
 * document-scroll presentation without changing the production route.
 */
export type PortraitSpikeRoute = 'a' | 'b';

export function portraitSpikeRouteForSearch(search: string): PortraitSpikeRoute | undefined {
  const searchParams = new URLSearchParams(search);
  const previewVersion = searchParams.get(PORTRAIT_PREVIEW_VERSION_QUERY);
  if (PORTRAIT_SUPPORTED_VERSIONS.some((version) => version === previewVersion)) {
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
