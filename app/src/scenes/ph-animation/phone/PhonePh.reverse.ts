import {
  preparePhoneTimelineVideoFrame,
  type PhoneTimelineVideoInput
} from '../../../production/phone/phone-timeline-runtime';
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
): PhoneTimelineVideoInput {
  return [
    runId,
    -1,
    phPlaybackProgress(progress),
    PH_DURATION_FALLBACK_SECONDS,
    0,
    PHONE_PH_FIGURE_END_SECONDS,
    null,
    PH_PLAYBACK_MS,
    'timeline',
    1,
    true,
    null
  ];
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

  const playback = createPhonePresentedReversePlayback([
    PH_PLAYBACK_MS,
    async (progress) => {
      const [status, resultRunId] = await preparePhoneTimelineVideoFrame(
        video,
        reverseFrameInput(runId, progress)
      );
      return status === 'ready' && resultRunId === runId;
    },
    (progress) => render(progress, -1),
    onComplete,
    onFailure,
    null,
    null,
    null
  ]);

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
    }
  };
}
