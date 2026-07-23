import { describe, expect, it } from 'vitest';
import {
  phoneLabContactApproachProgress,
  phoneLabContactAutoplayLocksSnap,
  phoneLabContactCrossedAutoplayBoundary,
  phoneLabContactOwnsNativePlayback,
  phoneLabContactPhaseFrame,
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
});
