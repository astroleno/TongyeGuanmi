import type { SegmentProgressPresenter } from '../story/presented-progress-coordinator';
import type {
  SegmentProgressReceipt,
  SegmentProgressRequest
} from '../story/types';

export const FRAME_LOCK_DISABLE_ENV = 'VITE_DISABLE_FRAME_LOCKED_MEDIA';
export const FRAME_LOCK_MIGRATION_EVIDENCE = 'legacy-migration' as const;

type FrameLockEnv = Readonly<{
  VITE_DISABLE_FRAME_LOCKED_MEDIA?: string;
}>;

export type FrameLockRolloutOptions = Readonly<{
  strictPresent: SegmentProgressPresenter;
  legacySeek(request: SegmentProgressRequest): void;
  env?: FrameLockEnv;
}>;

export function isFrameLockDisabled(env: FrameLockEnv = {
  VITE_DISABLE_FRAME_LOCKED_MEDIA: import.meta.env.VITE_DISABLE_FRAME_LOCKED_MEDIA
}): boolean {
  return env.VITE_DISABLE_FRAME_LOCKED_MEDIA === '1';
}

export function createFrameLockRolloutPresenter(
  options: FrameLockRolloutOptions
): SegmentProgressPresenter {
  const env = options.env ?? {
    VITE_DISABLE_FRAME_LOCKED_MEDIA: import.meta.env.VITE_DISABLE_FRAME_LOCKED_MEDIA
  };
  return (request): Promise<SegmentProgressReceipt> => {
    if (!isFrameLockDisabled(env)) {
      return Promise.resolve(options.strictPresent(request));
    }
    try {
      options.legacySeek(request);
      return Promise.resolve({
        status: 'presented',
        runId: request.runId,
        sequence: request.sequence,
        desiredProgress: request.desiredProgress,
        presentedProgress: request.desiredProgress,
        evidence: FRAME_LOCK_MIGRATION_EVIDENCE
      });
    } catch (error) {
      return Promise.reject(error);
    }
  };
}
