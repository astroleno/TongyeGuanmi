import {
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput
} from '../../../media/timeline-video-driver';
import {
  createPhonePresentedReversePlayback,
  type PhonePresentedReversePlayback
} from '../../../production/phone/phone-presented-reverse-playback';
import { PH_PLAYBACK_MS } from '../../../story/timings';
import {
  PHONE_PH_FIGURE_END_SECONDS,
  phPlaybackProgress,
  type PhonePhPlaybackDirection
} from './PhonePh.motion';

const PH_DURATION_FALLBACK_SECONDS = PHONE_PH_FIGURE_END_SECONDS + 1 / 30;

export type PhonePhPresentedReverse = PhonePresentedReversePlayback;

function reverseFrameInput(
  runId: string,
  progress: number
): TimelineVideoDriveInput {
  return {
    runId,
    direction: -1,
    progress: phPlaybackProgress(progress),
    durationFallbackSeconds: PH_DURATION_FALLBACK_SECONDS,
    startSeconds: 0,
    endSeconds: PHONE_PH_FIGURE_END_SECONDS,
    timelineDurationMs: PH_PLAYBACK_MS,
    mode: 'timeline',
    nativePlaybackDirection: 1,
    allowSeekedFrameFallback: true
  };
}

/**
 * d208a86's presented-frame reverse contract adapted to the PH packed-alpha
 * decoder. Canonical camera progress advances only after Safari has prepared
 * the matching media frame, so the retained Canvas cannot display the final
 * figure while the island has already returned to its opening position.
 */
export function createPhonePhPresentedReverse(
  root: HTMLElement,
  render: (
    progress: number,
    direction: PhonePhPlaybackDirection
  ) => void,
  onComplete: () => void,
  onFailure: () => void
): PhonePhPresentedReverse | null {
  const video = root.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  if (!video) return null;
  let runSequence = 0;
  let runId = 'phone-ph-reverse-0';

  const playback = createPhonePresentedReversePlayback({
    durationMs: PH_PLAYBACK_MS,
    prepare: async (progress) => {
      const result = await prepareTimelineVideoFrame(
        video,
        reverseFrameInput(runId, progress)
      );
      return result?.status === 'ready' && result.runId === runId;
    },
    render: (progress) => render(progress, -1),
    onComplete,
    onError: onFailure,
    onStatus: (status) => {
      if (import.meta.env.DEV) root.dataset.phonePhReverse = status;
    }
  });

  return {
    get active() {
      return playback.active;
    },
    start() {
      runSequence += 1;
      runId = `phone-ph-reverse-${runSequence}`;
      playback.start();
    },
    retry: playback.retry,
    stop: playback.stop,
    dispose() {
      playback.dispose();
      if (import.meta.env.DEV) delete root.dataset.phonePhReverse;
    }
  };
}
