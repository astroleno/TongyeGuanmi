import { type VideoFrameMap } from './frame-timebase';
import { createVideoPresentedFrameClock } from './strict-timeline-video-driver';
import type { PresentedFrameClock } from './presented-frame-clock';
import type { PhoneLeafGenerationBinding } from '../production/phone-story/presentation';
import type { PhoneMediaFrameReceipt, PhoneMediaFrameRequest } from '../production/phone-story/protocol';

export type PhoneFrameLockPresenterExtras = Readonly<{
  mapDesiredProgress: (progress: number, binding: PhoneLeafGenerationBinding) => number;
  paint: () => boolean;
}>;

export type PhoneFrameLockPresenter = Readonly<{
  present(request: PhoneMediaFrameRequest): Promise<PhoneMediaFrameReceipt>;
  reset(): void;
}>;

export function restorePhoneVideoSources(video: HTMLVideoElement): void {
  let restored = false;
  for (const source of video.querySelectorAll<HTMLSourceElement>('source')) {
    const src = source.dataset.src;
    if (!src || source.getAttribute('src') === src) continue;
    source.setAttribute('src', src);
    restored = true;
  }
  if (restored) {
    try { video.load(); } catch { /* detached media can reject reload */ }
  }
}

export function releasePhoneVideoSources(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  for (const source of video.querySelectorAll('source')) {
    const src = source.getAttribute?.('src');
    if (src) source.dataset.src = src;
    source.removeAttribute('src');
  }
  try { video.load(); } catch { /* detached media can reject reload */ }
}

function current(
  active: PhoneLeafGenerationBinding | null,
  request: PhoneMediaFrameRequest
): boolean {
  return Boolean(active && active.frameToken === request.frameToken
    && (!active.direction
      || (active.direction === 'reverse') === (request.direction === -1)));
}

export function createPhoneFrameLockPresenter(
  frameMap: VideoFrameMap,
  evidence: PhoneMediaFrameReceipt['evidence'],
  binding: () => PhoneLeafGenerationBinding | null,
  video: () => HTMLVideoElement | null,
  surface: () => HTMLElement | null,
  surfaceId: string,
  presentedFrameKey: string,
  extras: PhoneFrameLockPresenterExtras
): PhoneFrameLockPresenter {
  let clock: PresentedFrameClock | null = null;
  const stale = (request: PhoneMediaFrameRequest): PhoneMediaFrameReceipt => ({
    ...request, status: 'stale', presentedProgress: request.desiredProgress,
    presentedFrameIndex: -1, evidence
  });

  return {
    async present(request) {
      const decoder = video();
      const activeBefore = binding();
      if (!decoder || !activeBefore || !current(activeBefore, request)) {
        return stale(request);
      }
      const mediaProgress = extras.mapDesiredProgress(request.desiredProgress, activeBefore);
      const activeClock = clock ??= createVideoPresentedFrameClock(decoder);
      const result = await activeClock.request({ ...request, runId: request.transactionId,
        desiredProgress: mediaProgress, frameMap });
      const activeAfter = binding();
      if (!activeAfter || !current(activeAfter, request)
        || result.status !== 'presented' || result.evidence !== 'video-frame-callback') {
        return stale(request);
      }
      const target = surface();
      if (!target || !extras.paint()) return stale(request);
      target.dataset[presentedFrameKey] = String(result.presentedFrameIndex);
      activeAfter.reports.reportFrame(surfaceId, {
        kind: 'frame', token: request.frameToken, presented: true,
        frameId: request.frameToken
      });
      return {
        ...request, status: 'presented',
        presentedProgress: request.desiredProgress,
        presentedFrameIndex: result.presentedFrameIndex, evidence
      };
    },
    reset() {
      clock?.dispose();
      clock = null;
    }
  };
}
