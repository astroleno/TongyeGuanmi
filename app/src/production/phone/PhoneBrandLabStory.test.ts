import { describe, expect, it } from 'vitest';
import {
  phoneGroup45BoundaryProgress,
  phoneGroup45CanBeginVisualRun,
  phoneGroup45CrossedVisualBoundary,
  phoneGroup45CrossedVisualStart,
  phoneGroup45DocumentFlags,
  phoneGroup45EntryFromHash,
  phoneGroup45PhaseAfterVisualCompletion,
  phoneGroup45ReducedReceiverProgress,
  phoneGroup45RetainsTtgTerminal,
  phoneGroup45TrackActivity,
  phoneGroup45TrackProgress
} from './PhoneBrandLabStory';

describe('PhoneBrandLabStory', () => {
  it('starts scope hashes at the requested group chapter without earlier media', () => {
    expect(phoneGroup45EntryFromHash('#services')).toBe('services');
    expect(phoneGroup45EntryFromHash('#lab')).toBe('lab');
    expect(phoneGroup45EntryFromHash('#method')).toBe('brand');
  });

  it('releases the desktop document overflow lock in both motion modes', () => {
    expect(phoneGroup45DocumentFlags(false)).toEqual({
      portraitSpike: 'b',
      portraitSpikeMotion: 'force'
    });
    expect(phoneGroup45DocumentFlags(true)).toEqual({
      portraitSpike: 'b',
      portraitSpikeMotion: 'reduce'
    });
  });

  it('keeps one-screen autonomous visual chapters at their stable input', () => {
    expect(phoneGroup45TrackProgress(0, 800, 800)).toBe(0);
    expect(phoneGroup45TrackProgress(-240, 800, 800)).toBe(0);
    expect(phoneGroup45TrackProgress(800, 1600, 800)).toBe(0);
    expect(phoneGroup45TrackProgress(0, 1600, 800)).toBe(0);
    expect(phoneGroup45TrackProgress(-400, 1600, 800)).toBe(0.5);
    expect(phoneGroup45TrackProgress(-800, 1600, 800)).toBe(1);
    expect(phoneGroup45BoundaryProgress(800, 1200, 800)).toBe(0);
    expect(phoneGroup45BoundaryProgress(340, 1200, 800)).toBe(.5);
    expect(phoneGroup45BoundaryProgress(0, 1200, 800)).toBe(1);
  });

  it('commits reduced-motion receivers only after the shared boundary', () => {
    expect(phoneGroup45ReducedReceiverProgress(1)).toBe(0);
    expect(phoneGroup45ReducedReceiverProgress(0)).toBe(0);
    expect(phoneGroup45ReducedReceiverProgress(-1)).toBe(1);
  });

  it('keeps a visual chapter out of autoplay until it owns the screen', () => {
    // Brand's next visual is allowed to prewarm in the lower viewport, but
    // its media must not run beneath Brand's native reading content.
    expect(phoneGroup45TrackActivity(696, 844, 844)).toMatchObject({
      active: false,
      prewarm: true
    });
    expect(phoneGroup45TrackActivity(0, 844, 844)).toMatchObject({
      active: true,
      prewarm: true,
      progress: 0
    });
    // A normal touch swipe is allowed to overshoot the exact top edge while
    // the scene remains the majority owner of the viewport.
    expect(phoneGroup45TrackActivity(-100, 844, 844)).toMatchObject({
      active: true,
      progress: 0
    });
    expect(phoneGroup45TrackActivity(-500, 844, 844)).toMatchObject({
      active: false,
      progress: 0
    });
    expect(phoneGroup45CrossedVisualStart(0, 900, -56)).toBe(true);
    expect(phoneGroup45CrossedVisualStart(900, 940, -96)).toBe(false);
    expect(phoneGroup45CrossedVisualBoundary(900, 800, 44)).toBe(true);
    expect(phoneGroup45CrossedVisualBoundary(800, 760, 84)).toBe(false);
  });

  it('latches each media run until the opposite direction completes', () => {
    expect(phoneGroup45CanBeginVisualRun('initial', 1)).toBe(true);
    expect(phoneGroup45CanBeginVisualRun('forward', 1)).toBe(false);
    expect(phoneGroup45CanBeginVisualRun('complete', 1)).toBe(false);
    expect(phoneGroup45CanBeginVisualRun('complete', -1)).toBe(true);
    expect(phoneGroup45CanBeginVisualRun('reverse', -1)).toBe(false);
    expect(phoneGroup45PhaseAfterVisualCompletion(1)).toBe('complete');
    expect(phoneGroup45PhaseAfterVisualCompletion(-1)).toBe('initial');
    expect(phoneGroup45RetainsTtgTerminal('complete')).toBe(true);
    expect(phoneGroup45RetainsTtgTerminal('reverse')).toBe(false);
  });

});
