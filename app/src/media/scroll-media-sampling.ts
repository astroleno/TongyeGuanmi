/** Synchronous sampling phases: collect seeks, restore/commit the visual pose, then issue seeks. */
export type ScrollMediaSamplingPhase = 'live' | 'request' | 'present' | 'hold';
let phase: ScrollMediaSamplingPhase = 'live';
let requests: Map<HTMLVideoElement, () => void> | null = null;
const compositors = new WeakMap<HTMLVideoElement, () => boolean>();
export function registerScrollMediaCompositor(video: HTMLVideoElement, render: () => boolean): () => void {
  compositors.set(video, render);
  return () => { if (compositors.get(video) === render) compositors.delete(video); };
}
export function compositeScrollMedia(video: HTMLVideoElement): boolean {
  return compositors.get(video)?.() ?? true;
}
export const scrollMediaSamplingPhase = () => phase;
export function deferScrollMediaRequest(video: HTMLVideoElement, request: () => void): boolean {
  if (phase === 'live') return false;
  if (phase === 'request') requests?.set(video, request);
  return true;
}
export function sampleScrollMedia<T>(next: ScrollMediaSamplingPhase, sample: () => T): T {
  const previous = phase; phase = next;
  try { return sample(); } finally { phase = previous; }
}
export function collectScrollMediaRequests(sample: () => void): Map<HTMLVideoElement, () => void> {
  const previous = requests;
  const collected = new Map<HTMLVideoElement, () => void>(); requests = collected;
  try { sampleScrollMedia('request', sample); } finally { requests = previous; }
  return collected;
}
export function canCompositeScrollMedia(video: HTMLVideoElement): boolean {
  return video.dataset?.scrollMediaCoherent !== 'true' || phase === 'present';
}
