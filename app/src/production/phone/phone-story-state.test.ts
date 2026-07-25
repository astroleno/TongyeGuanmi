import { describe, expect, it } from 'vitest';
import {
  createPhoneStoryHold,
  reducePhoneStoryCursor,
  startPhoneStoryRun
} from './phone-story-state';

const activeRun = () => startPhoneStoryRun(
  createPhoneStoryHold('brand'),
  'brand-services',
  1,
  { sessionId: 'phone-session-1', generation: 1 }
);

describe('canonical phone story cursor', () => {
  it('stores composite identity while advancing individual forward legs', () => {
    const first = activeRun();
    expect(first).toMatchObject({
      kind: 'transition',
      run: 'brand-services',
      legIndex: 0,
      runSource: 'brand',
      runTarget: 'services',
      segment: 'brand-figure3',
      from: 'brand',
      to: 'figure3-animation',
      direction: 1,
      phase: 'preparing',
      progress: 0
    });

    const second = reducePhoneStoryCursor(first, {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-1',
      generation: 1
    });
    expect(second).toMatchObject({
      kind: 'transition',
      run: 'brand-services',
      legIndex: 1,
      runSource: 'brand',
      runTarget: 'services',
      segment: 'figure3-services',
      progress: 0
    });
  });

  it('uses canonical forward-domain progress while reversing leg order', () => {
    const first = startPhoneStoryRun(
      createPhoneStoryHold('services'),
      'brand-services',
      -1,
      { sessionId: 'phone-session-2', generation: 2 }
    );
    expect(first).toMatchObject({
      legIndex: 1,
      segment: 'figure3-services',
      runSource: 'services',
      runTarget: 'brand',
      direction: -1,
      progress: 1
    });

    const second = reducePhoneStoryCursor(first, {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-2',
      generation: 2
    });
    expect(second).toMatchObject({
      legIndex: 0,
      segment: 'brand-figure3',
      progress: 1
    });
  });

  it('rejects stale generations and non-monotonic progress callbacks', () => {
    const active = activeRun();
    const progressed = reducePhoneStoryCursor(active, {
      type: 'PROGRESS',
      sessionId: 'phone-session-1',
      generation: 1,
      progress: 0.7
    });
    expect(progressed).toMatchObject({ progress: 0.7 });
    expect(reducePhoneStoryCursor(progressed, {
      type: 'PROGRESS',
      sessionId: 'phone-session-1',
      generation: 1,
      progress: 0.3
    })).toBe(progressed);
    expect(reducePhoneStoryCursor(progressed, {
      type: 'PHASE',
      sessionId: 'phone-session-1',
      generation: 0,
      phase: 'media'
    })).toBe(progressed);
  });

  it('rolls a second-leg forward failure back to the composite source', () => {
    const secondLeg = reducePhoneStoryCursor(activeRun(), {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-1',
      generation: 1
    });
    const rollingBack = reducePhoneStoryCursor(secondLeg, {
      type: 'FAIL',
      sessionId: 'phone-session-1',
      generation: 1
    });
    expect(rollingBack).toMatchObject({
      kind: 'transition',
      phase: 'rolling-back',
      runSource: 'brand',
      legIndex: 1
    });
    expect(reducePhoneStoryCursor(rollingBack, {
      type: 'ROLLBACK_COMMITTED',
      sessionId: 'phone-session-1',
      generation: 1
    })).toEqual({
      kind: 'hold',
      scene: 'brand',
      revision: 1
    });
  });

  it('commits only from the terminal leg to the direction-specific target', () => {
    const first = activeRun();
    expect(reducePhoneStoryCursor(first, {
      type: 'COMMIT',
      sessionId: 'phone-session-1',
      generation: 1
    })).toBe(first);

    const second = reducePhoneStoryCursor(first, {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-1',
      generation: 1
    });
    expect(reducePhoneStoryCursor(second, {
      type: 'COMMIT',
      sessionId: 'phone-session-1',
      generation: 1
    })).toEqual({
      kind: 'hold',
      scene: 'services',
      revision: 1
    });
  });
});
