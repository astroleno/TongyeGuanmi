import { describe, expect, it } from 'vitest';
import {
  phoneLabContactApproachProgress,
  phoneLabContactAutoplayFrame,
  phoneLabContactAutoplayToken,
  phoneLabContactAtOrPastVisualBoundary,
  phoneLabContactCanArmReverseGesture,
  phoneLabContactCanBeginVisualRun,
  phoneLabContactCommittedBoundaryProgress,
  phoneLabContactCrossedVisualBoundary,
  phoneLabContactCrossedVisualStart,
  phoneLabContactHasReverseGestureIntent,
  phoneLabContactInkBoundaryProgress,
  phoneLabContactPhaseAfterVisualCompletion,
  phoneLabContactRetainsCraneTerminal,
  phoneLabContactRetainsPhTerminal,
  phoneLabContactVisualBoundaryY,
  type PhoneLabContactCinematicRunState
} from './phone-lab-contact-timeline';

describe('phone Lab → Contact shared-boundary timeline', () => {
  it('permits only initial → forward → complete → reverse → initial cycles', () => {
    let phase: PhoneLabContactCinematicRunState = 'initial';

    expect(phoneLabContactCanBeginVisualRun(phase, 1)).toBe(true);
    expect(phoneLabContactCanBeginVisualRun(phase, -1)).toBe(false);
    phase = 'forward';
    expect(phoneLabContactCanBeginVisualRun(phase, 1)).toBe(false);
    phase = phoneLabContactPhaseAfterVisualCompletion(1);
    expect(phase).toBe('complete');
    expect(phoneLabContactCanBeginVisualRun(phase, -1)).toBe(true);
    phase = 'reverse';
    expect(phoneLabContactCanBeginVisualRun(phase, -1)).toBe(false);
    phase = phoneLabContactPhaseAfterVisualCompletion(-1);
    expect(phase).toBe('initial');
    expect(phoneLabContactCanBeginVisualRun(phase, 1)).toBe(true);
  });

  it('retains adjacent terminal compositors with the Unit 5 media-slot policy', () => {
    expect(phoneLabContactRetainsPhTerminal('complete')).toBe(true);
    expect(phoneLabContactRetainsPhTerminal('complete', true)).toBe(false);
    expect(phoneLabContactRetainsPhTerminal('initial')).toBe(false);
    expect(phoneLabContactRetainsCraneTerminal('complete')).toBe(true);
    expect(phoneLabContactRetainsCraneTerminal('reverse')).toBe(false);
  });

  it('uses the one marker top for both forward and reverse ownership', () => {
    const boundaryY = phoneLabContactVisualBoundaryY(1500, 42);

    expect(boundaryY).toBe(1542);
    expect(phoneLabContactCrossedVisualStart(
      1500,
      1600,
      -58
    )).toBe(true);
    expect(phoneLabContactCrossedVisualBoundary(
      1600,
      1500,
      42
    )).toBe(true);
  });

  it('publishes the receiver on Safari’s sub-pixel maximum-scroll sample', () => {
    expect(phoneLabContactAtOrPastVisualBoundary(3584.5, 3584.609375))
      .toBe(true);
    expect(phoneLabContactAtOrPastVisualBoundary(3583, 3584.609375))
      .toBe(false);
    expect(phoneLabContactAtOrPastVisualBoundary(3584.5, 3584.609375, 0))
      .toBe(false);
  });

  it('accepts Safari reverse approach inside the reviewed 32px edge window', () => {
    expect(phoneLabContactCrossedVisualBoundary(
      1600,
      1570,
      -28
    )).toBe(true);
    expect(phoneLabContactCrossedVisualBoundary(
      1600,
      1580,
      -38
    )).toBe(false);
    expect(phoneLabContactCrossedVisualBoundary(
      1500,
      1510,
      32
    )).toBe(false);
  });


  it('arms touch reverse on the same released boundary', () => {
    expect(phoneLabContactCanArmReverseGesture(
      'complete',
      1542,
      1542
    )).toBe(true);
    expect(phoneLabContactCanArmReverseGesture(
      'complete',
      1573,
      1542
    )).toBe(true);
    expect(phoneLabContactCanArmReverseGesture(
      'complete',
      1575,
      1542
    )).toBe(false);
    expect(phoneLabContactCanArmReverseGesture(
      'forward',
      1542,
      1542
    )).toBe(false);
    expect(phoneLabContactHasReverseGestureIntent(200, 210)).toBe(true);
    expect(phoneLabContactHasReverseGestureIntent(200, 209)).toBe(false);
  });

  it('keeps upstream transitions committed while native time owns the stage', () => {
    expect(phoneLabContactCommittedBoundaryProgress(0.2, true)).toBe(1);
    expect(phoneLabContactCommittedBoundaryProgress(0.2, false)).toBe(0.2);
    expect(phoneLabContactCommittedBoundaryProgress(-1, false)).toBe(0);
    expect(phoneLabContactCommittedBoundaryProgress(2, false)).toBe(1);
  });

  it('retains the reviewed approach windows for ink and endpoint dissolves', () => {
    expect(phoneLabContactApproachProgress(932, 932)).toBe(0);
    expect(phoneLabContactApproachProgress(466, 932)).toBe(0.5);
    expect(phoneLabContactApproachProgress(0, 932)).toBe(1);

    expect(phoneLabContactInkBoundaryProgress(932, 932)).toBe(0);
    expect(phoneLabContactInkBoundaryProgress(792.2, 932)).toBeCloseTo(0);
    expect(phoneLabContactInkBoundaryProgress(396.1, 932)).toBeCloseTo(0.5);
    expect(phoneLabContactInkBoundaryProgress(0, 932)).toBe(1);
  });

  it('requires formal media evidence to carry its captured execution identity', () => {
    const frame = {
      token: {
        authorityId: 'phone-authority-9',
        sessionId: 'session-4',
        generation: 7,
        leg: 1,
        revision: 12,
        subject: 'group67:ph',
        kind: 'packed-canvas-frame' as const
      },
      frameSequence: 3,
      observedAt: 48
    };
    expect(phoneLabContactAutoplayToken([
      'ph-animation',
      'progress',
      1,
      ['phone-authority-9', 'session-4', 7, 1, 1],
      .5,
      null
    ])).toEqual(['phone-authority-9', 'session-4', 7, 1, 1]);
    expect(phoneLabContactAutoplayFrame([
      'ph-animation',
      'presented',
      1,
      ['phone-authority-9', 'session-4', 7, 1, 1, frame.token],
      null,
      frame
    ])).toBe(frame);
    expect(phoneLabContactAutoplayToken([
      'crane-animation',
      'complete',
      -1,
      null,
      null,
      null
    ])).toBeNull();
  });
});
