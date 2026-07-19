import { describe, expect, it } from 'vitest';
import {
  checkpointOrderIsForward,
  checkpointOrderIsReverse,
  portraitCheckpointAfterVisibilityRecovery,
  portraitCheckpointTrace,
  portraitLoaderShouldRemainHidden
} from './portrait-checkpoints';

describe('Route B v16 checkpoint characterization', () => {
  it('records forward and reverse scroll in semantic order', () => {
    const forward = portraitCheckpointTrace([0, 0.18, 0.31, 0.54, 0.64, 0.74, 0.82, 1]);
    expect(checkpointOrderIsForward(forward)).toBe(true);

    const reverse = portraitCheckpointTrace([1, 0.82, 0.74, 0.64, 0.54, 0.31, 0.18, 0]);
    expect(checkpointOrderIsReverse(reverse)).toBe(true);
  });

  it('treats a normal refresh and lock-screen recovery differently', () => {
    expect(portraitLoaderShouldRemainHidden({
      sameDocument: false,
      completedBeforeVisibilityChange: true
    })).toBe(false);
    expect(portraitLoaderShouldRemainHidden({
      sameDocument: true,
      completedBeforeVisibilityChange: true
    })).toBe(true);
  });

  it('keeps the active checkpoint through a locked-document recovery', () => {
    expect(portraitCheckpointAfterVisibilityRecovery('aod-autoplay', true)).toBe('aod-autoplay');
    expect(portraitCheckpointAfterVisibilityRecovery('aod-autoplay', false)).toBe('loader');
  });
});
