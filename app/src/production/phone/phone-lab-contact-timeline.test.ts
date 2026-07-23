import { describe, expect, it } from 'vitest';
import {
  phoneLabContactApproachProgress,
  phoneLabContactAutoplayLocksSnap,
  phoneLabContactCanArmReverseGesture,
  phoneLabContactCrossedAutoplayBoundary,
  phoneLabContactCrossedReverseIntentBoundary,
  phoneLabContactHasReverseGestureIntent,
  phoneLabContactInkBoundaryProgress,
  phoneLabContactOwnsNativePlayback,
  phoneLabContactPhaseFrame,
  phoneLabContactReverseBoundaryY,
  phoneLabContactReverseIntentBoundaryY,
  phoneLabContactReverseRunAnchor,
  phoneLabContactScrollProgress,
  phoneLabContactShouldStartCinematic
} from './phone-lab-contact-timeline';

describe('phone Lab → Contact acceptance timeline', () => {
  it('waits for real playback evidence before cinematic snap owns input', () => {
    expect(phoneLabContactAutoplayLocksSnap({
      scene: 'ph-animation',
      phase: 'start',
      direction: 1
    })).toBe(false);
    expect(phoneLabContactAutoplayLocksSnap({
      scene: 'ph-animation',
      phase: 'playing',
      direction: 1
    })).toBe(true);
    expect(phoneLabContactAutoplayLocksSnap({
      scene: 'crane-animation',
      phase: 'complete',
      direction: 1
    })).toBe(false);
    expect(phoneLabContactAutoplayLocksSnap({
      scene: 'crane-animation',
      phase: 'progress',
      direction: 1,
      progress: 0.8
    })).toBe(false);
  });

  it('keeps each handoff bounded to its stable endpoints without a hidden hold', () => {
    expect(phoneLabContactPhaseFrame(0)).toMatchObject({
      handoffProgress: 0,
      sceneProgress: 0,
      arrivalProgress: 0,
      stageActive: true
    });
    expect(phoneLabContactPhaseFrame(0.01)).toMatchObject({
      handoffProgress: 1,
      sceneProgress: 0,
      arrivalProgress: 0
    });
    expect(phoneLabContactPhaseFrame(0.99)).toMatchObject({
      handoffProgress: 1,
      sceneProgress: 1,
      arrivalProgress: 0
    });
    expect(phoneLabContactPhaseFrame(1)).toMatchObject({
      handoffProgress: 1,
      sceneProgress: 1,
      arrivalProgress: 1,
      stageActive: false
    });
  });

  it('uses deterministic endpoints in reduced motion', () => {
    expect(phoneLabContactPhaseFrame(0.49, true).progress).toBe(0);
    expect(phoneLabContactPhaseFrame(0.5, true)).toMatchObject({
      progress: 1,
      arrivalProgress: 1,
      stageActive: false
    });
  });

  it('does not park native media when integer snap rounding enters the exit lane', () => {
    const roundedSnap = phoneLabContactPhaseFrame(0.995);

    expect(phoneLabContactOwnsNativePlayback(roundedSnap, false)).toBe(false);
    expect(phoneLabContactOwnsNativePlayback(roundedSnap, true)).toBe(true);
    expect(phoneLabContactOwnsNativePlayback(phoneLabContactPhaseFrame(1), true)).toBe(true);
    expect(phoneLabContactOwnsNativePlayback(phoneLabContactPhaseFrame(0), true)).toBe(false);
  });

  it("maps the sticky rail's native scroll distance in both directions", () => {
    expect(phoneLabContactScrollProgress(0, 500, 100)).toBe(0);
    expect(phoneLabContactScrollProgress(-200, 500, 100)).toBe(0.5);
    expect(phoneLabContactScrollProgress(-400, 500, 100)).toBe(1);
    expect(phoneLabContactScrollProgress(32, 500, 100)).toBe(0);
  });

  it('gives the incoming viewport to endpoint transitions before media starts', () => {
    expect(phoneLabContactApproachProgress(932, 932)).toBe(0);
    expect(phoneLabContactApproachProgress(466, 932)).toBe(0.5);
    expect(phoneLabContactApproachProgress(0, 932)).toBe(1);
    expect(phoneLabContactApproachProgress(-40, 932)).toBe(1);
  });

  it("uses Unit 4–5's reviewed lower-85% ink ownership window", () => {
    expect(phoneLabContactInkBoundaryProgress(932, 932)).toBe(0);
    expect(phoneLabContactInkBoundaryProgress(792.2, 932)).toBeCloseTo(0);
    expect(phoneLabContactInkBoundaryProgress(396.1, 932)).toBeCloseTo(0.5);
    expect(phoneLabContactInkBoundaryProgress(0, 932)).toBe(1);
  });

  it('starts native playback when one physical sample skips the short snap lane', () => {
    expect(phoneLabContactCrossedAutoplayBoundary(
      1200,
      1800,
      1542,
      169,
      1
    )).toBe(true);
    expect(phoneLabContactCrossedAutoplayBoundary(
      1800,
      1600,
      1542,
      169,
      -1
    )).toBe(true);
    expect(phoneLabContactCrossedAutoplayBoundary(
      1800,
      1725,
      1542,
      169,
      -1
    )).toBe(true);
    expect(phoneLabContactCrossedAutoplayBoundary(
      1800,
      1750,
      1542,
      169,
      -1
    )).toBe(false);
    expect(phoneLabContactCrossedAutoplayBoundary(
      1200,
      1400,
      1542,
      169,
      1
    )).toBe(false);
    expect(phoneLabContactCrossedAutoplayBoundary(
      1500,
      1542,
      1542,
      169,
      1
    )).toBe(true);
  });

  it('recovers reverse playback when Safari rounds below the released 99% snap', () => {
    expect(phoneLabContactShouldStartCinematic({
      runState: 'complete',
      direction: -1,
      previousScrollY: 1708,
      nextScrollY: 1706,
      phaseTop: 1542,
      phaseDistance: 169,
      phaseProgress: 0.97,
      phaseInRange: true
    })).toBe(true);
    expect(phoneLabContactShouldStartCinematic({
      runState: 'handoff',
      direction: -1,
      previousScrollY: 1708,
      nextScrollY: 1706,
      phaseTop: 1542,
      phaseDistance: 169,
      phaseProgress: 0.97,
      phaseInRange: true
    })).toBe(false);
    expect(phoneLabContactShouldStartCinematic({
      runState: 'complete',
      direction: -1,
      previousScrollY: 1900,
      nextScrollY: 1890,
      phaseTop: 1542,
      phaseDistance: 169,
      phaseProgress: 1,
      phaseInRange: false
    })).toBe(false);
  });

  it('arms reverse touch intent on the exact released cinematic edge', () => {
    const boundaryY = phoneLabContactReverseIntentBoundaryY(1542, 1118);
    expect(boundaryY).toBe(2660);
    expect(phoneLabContactCanArmReverseGesture(
      'complete',
      boundaryY,
      boundaryY
    )).toBe(true);
    expect(phoneLabContactCanArmReverseGesture(
      'complete',
      boundaryY + 31,
      boundaryY
    )).toBe(true);
    expect(phoneLabContactCanArmReverseGesture(
      'complete',
      boundaryY + 33,
      boundaryY
    )).toBe(false);
    expect(phoneLabContactCanArmReverseGesture(
      'forward',
      boundaryY,
      boundaryY
    )).toBe(false);
    expect(phoneLabContactHasReverseGestureIntent(200, 210)).toBe(true);
    expect(phoneLabContactHasReverseGestureIntent(200, 209)).toBe(false);
    expect(phoneLabContactHasReverseGestureIntent(200, 190)).toBe(false);
  });

  it('claims reverse at the receiver edge before the released media spacer', () => {
    const phaseTop = 1542;
    const phaseHeight = 1118;
    const phaseDistance = 186;
    const intentBoundary = phoneLabContactReverseIntentBoundaryY(
      phaseTop,
      phaseHeight
    );
    const runAnchor = phoneLabContactReverseBoundaryY(
      phaseTop,
      phaseDistance
    );

    expect(intentBoundary).toBe(2660);
    expect(runAnchor).toBeCloseTo(1726.14);
    expect(intentBoundary - runAnchor).toBeGreaterThan(900);
    expect(phoneLabContactCrossedReverseIntentBoundary(
      2660,
      2540,
      intentBoundary
    )).toBe(true);
    expect(phoneLabContactCrossedReverseIntentBoundary(
      2540,
      2500,
      intentBoundary
    )).toBe(false);
    expect(phoneLabContactCrossedReverseIntentBoundary(
      2500,
      2540,
      intentBoundary
    )).toBe(false);
  });

  it('returns every reverse run to its canonical media anchor after overshoot', () => {
    expect(phoneLabContactReverseRunAnchor(1680, 1709)).toBe(1709);
    expect(phoneLabContactReverseRunAnchor(1720, 1709)).toBe(1709);
  });
});
