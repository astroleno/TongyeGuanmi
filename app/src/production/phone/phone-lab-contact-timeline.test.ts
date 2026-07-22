import { describe, expect, it } from 'vitest';
import {
  phoneLabContactPhaseFrame,
  phoneLabContactScrollProgress
} from './phone-lab-contact-timeline';

describe('phone Lab → Contact acceptance timeline', () => {
  it('keeps each handoff bounded to its stable endpoints without a hidden hold', () => {
    expect(phoneLabContactPhaseFrame(0)).toMatchObject({
      handoffProgress: 0,
      sceneProgress: 0,
      arrivalProgress: 0,
      stageActive: true
    });
    expect(phoneLabContactPhaseFrame(0.16)).toMatchObject({
      handoffProgress: 1,
      sceneProgress: 0,
      arrivalProgress: 0
    });
    expect(phoneLabContactPhaseFrame(0.78)).toMatchObject({
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

  it("maps the sticky rail's native scroll distance in both directions", () => {
    expect(phoneLabContactScrollProgress(0, 500, 100)).toBe(0);
    expect(phoneLabContactScrollProgress(-200, 500, 100)).toBe(0.5);
    expect(phoneLabContactScrollProgress(-400, 500, 100)).toBe(1);
    expect(phoneLabContactScrollProgress(32, 500, 100)).toBe(0);
  });
});
