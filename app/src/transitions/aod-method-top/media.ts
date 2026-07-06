import type { PrepareToken, SegmentRunId } from '../../story/types';

export const AOD_MEDIA_KEY = 'aod_figure-alpha-front-scrub';

export type AodVideoMilestone = 'loadedmetadata' | 'canplay' | 'ended' | 'timeout';

export type AodVideoMilestoneRecord = {
  milestone: AodVideoMilestone;
  key: typeof AOD_MEDIA_KEY;
  prepareToken?: PrepareToken;
  runId?: SegmentRunId;
  accepted: boolean;
  reason?: 'duplicate' | 'stale' | 'timeout' | 'missing-video';
  readyState?: number | undefined;
};

export type WaitForAodVideoReadyOptions = {
  prepareToken: PrepareToken;
  timeoutMs: number;
  isCurrent?: ((prepareToken: PrepareToken) => boolean) | undefined;
  onMilestone?: ((record: AodVideoMilestoneRecord) => void) | undefined;
};

export type WaitForAodVideoEndedOptions = {
  runId: SegmentRunId;
  timeoutMs: number;
  isCurrent?: ((runId: SegmentRunId) => boolean) | undefined;
  onMilestone?: ((record: AodVideoMilestoneRecord) => void) | undefined;
};

type AodVideoLike = Pick<HTMLVideoElement, 'addEventListener' | 'removeEventListener'> & {
  readyState?: number;
  paused?: boolean;
  currentTime?: number;
  duration?: number;
  playbackRate?: number;
  play?: () => Promise<void> | void;
  pause?: () => void;
};

function report(
  onMilestone: ((record: AodVideoMilestoneRecord) => void) | undefined,
  record: AodVideoMilestoneRecord
): void {
  onMilestone?.(record);
}

function hasMetadata(video: AodVideoLike): boolean {
  return (video.readyState ?? 0) >= 1;
}

function canPlay(video: AodVideoLike): boolean {
  return (video.readyState ?? 0) >= 3;
}

export function waitForAodVideoReady(
  video: AodVideoLike | null | undefined,
  options: WaitForAodVideoReadyOptions
): Promise<void> {
  if (!video) {
    report(options.onMilestone, {
      milestone: 'timeout',
      key: AOD_MEDIA_KEY,
      prepareToken: options.prepareToken,
      accepted: false,
      reason: 'missing-video'
    });
    return Promise.reject(new Error('AOD video element is missing'));
  }

  return new Promise((resolve, reject) => {
    let metadataSeen = false;
    let canplaySeen = false;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('canplay', onCanPlay);
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
    };

    const accept = (milestone: Exclude<AodVideoMilestone, 'ended' | 'timeout'>) => {
      if (settled) {
        return;
      }
      if (options.isCurrent && !options.isCurrent(options.prepareToken)) {
        report(options.onMilestone, {
          milestone,
          key: AOD_MEDIA_KEY,
          prepareToken: options.prepareToken,
          accepted: false,
          reason: 'stale',
          readyState: video.readyState
        });
        return;
      }
      const duplicate = milestone === 'loadedmetadata' ? metadataSeen : canplaySeen;
      if (duplicate) {
        report(options.onMilestone, {
          milestone,
          key: AOD_MEDIA_KEY,
          prepareToken: options.prepareToken,
          accepted: false,
          reason: 'duplicate',
          readyState: video.readyState
        });
        return;
      }
      if (milestone === 'loadedmetadata') {
        metadataSeen = true;
      } else {
        canplaySeen = true;
      }
      report(options.onMilestone, {
        milestone,
        key: AOD_MEDIA_KEY,
        prepareToken: options.prepareToken,
        accepted: true,
        readyState: video.readyState
      });
      if (metadataSeen && canplaySeen) {
        settled = true;
        cleanup();
        resolve();
      }
    };

    const onMetadata = () => accept('loadedmetadata');
    const onCanPlay = () => accept('canplay');

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('canplay', onCanPlay);
    timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      report(options.onMilestone, {
        milestone: 'timeout',
        key: AOD_MEDIA_KEY,
        prepareToken: options.prepareToken,
        accepted: false,
        reason: 'timeout',
        readyState: video.readyState
      });
      reject(new Error(`AOD video readiness timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    if (hasMetadata(video)) {
      queueMicrotask(onMetadata);
    }
    if (canPlay(video)) {
      queueMicrotask(onCanPlay);
    }
  });
}

export function waitForAodVideoEnded(
  video: AodVideoLike | null | undefined,
  options: WaitForAodVideoEndedOptions
): Promise<void> {
  if (!video) {
    report(options.onMilestone, {
      milestone: 'ended',
      key: AOD_MEDIA_KEY,
      runId: options.runId,
      accepted: false,
      reason: 'missing-video'
    });
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let endedSeen = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      video.removeEventListener('ended', onEnded);
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
    };

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };

    const onEnded = () => {
      if (options.isCurrent && !options.isCurrent(options.runId)) {
        report(options.onMilestone, {
          milestone: 'ended',
          key: AOD_MEDIA_KEY,
          runId: options.runId,
          accepted: false,
          reason: 'stale',
          readyState: video.readyState
        });
        return;
      }
      if (endedSeen) {
        report(options.onMilestone, {
          milestone: 'ended',
          key: AOD_MEDIA_KEY,
          runId: options.runId,
          accepted: false,
          reason: 'duplicate',
          readyState: video.readyState
        });
        return;
      }
      endedSeen = true;
      report(options.onMilestone, {
        milestone: 'ended',
        key: AOD_MEDIA_KEY,
        runId: options.runId,
        accepted: true,
        readyState: video.readyState
      });
      finish();
    };

    video.addEventListener('ended', onEnded);
    timeout = setTimeout(() => {
      report(options.onMilestone, {
        milestone: 'timeout',
        key: AOD_MEDIA_KEY,
        runId: options.runId,
        accepted: false,
        reason: 'timeout',
        readyState: video.readyState
      });
      finish();
    }, options.timeoutMs);
  });
}
