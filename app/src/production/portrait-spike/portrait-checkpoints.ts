import {
  FRONT_HALF_CHECKPOINT_IDS,
  type FrontHalfCheckpointId
} from '../../story/semantic-checkpoints';
import { phoneStageFrame } from '../phone/phone-stage-timeline';

/**
 * Characterization facade retained for `?v=16`.  Production imports the phone
 * timeline directly; the spike only records and compares semantic evidence.
 */
export type PortraitCheckpointTrace = Readonly<{
  checkpoint: FrontHalfCheckpointId;
  progress: number;
}>;

export function portraitCheckpointAt(progress: number): PortraitCheckpointTrace {
  const frame = phoneStageFrame(progress);
  return { checkpoint: frame[1], progress: frame[0] };
}

export function portraitCheckpointTrace(progresses: readonly number[]): readonly PortraitCheckpointTrace[] {
  return progresses.map(portraitCheckpointAt);
}

export function checkpointOrderIsForward(trace: readonly PortraitCheckpointTrace[]): boolean {
  return trace.every((entry, index) => {
    const previous = trace[index - 1];
    return !previous
      || FRONT_HALF_CHECKPOINT_IDS.indexOf(previous.checkpoint)
        <= FRONT_HALF_CHECKPOINT_IDS.indexOf(entry.checkpoint);
  });
}

export function checkpointOrderIsReverse(trace: readonly PortraitCheckpointTrace[]): boolean {
  return trace.every((entry, index) => {
    const previous = trace[index - 1];
    return !previous
      || FRONT_HALF_CHECKPOINT_IDS.indexOf(previous.checkpoint)
        >= FRONT_HALF_CHECKPOINT_IDS.indexOf(entry.checkpoint);
  });
}

/** Normal navigation reloads the Loader; an in-document unlock does not. */
export function portraitLoaderShouldRemainHidden(input: Readonly<{
  sameDocument: boolean;
  completedBeforeVisibilityChange: boolean;
}>): boolean {
  return input.sameDocument && input.completedBeforeVisibilityChange;
}

/** Lock/unlock is a layout recovery, not a new story run. */
export function portraitCheckpointAfterVisibilityRecovery(
  checkpoint: FrontHalfCheckpointId,
  loaderHidden: boolean
): FrontHalfCheckpointId {
  return loaderHidden ? checkpoint : 'loader';
}
