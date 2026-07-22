import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeElement } from '../__fixtures__/back-half.fixture';
import {
  applyPhonePhEducationFrame,
  PHONE_PH_EDUCATION_ANIMATION_STOP,
  PHONE_PH_EDUCATION_DECISION,
  phonePhEducationFallbackFrame,
  phonePhEducationFrame
} from './phone';

const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');

describe('Phone PH → Education transition', () => {
  it('documents the terminal-PH plus native-Education dissolve decision', () => {
    expect(PHONE_PH_EDUCATION_DECISION).toMatchObject({
      mode: 'endpoint-dissolve',
      source: 'canonical-ph-timing'
    });
    expect(source).not.toContain('<canvas');
    expect(source).not.toMatch(/createPhoneInk/);
    expect(source).not.toContain('preparePhAnimationFrame');
    expect(source).not.toContain('parkPhonePhMedia');
  });

  it('runs PH to its terminal frame before immediately dissolving to Education', () => {
    const atStop = phonePhEducationFrame(PHONE_PH_EDUCATION_ANIMATION_STOP);
    const midpoint = phonePhEducationFrame(
      (PHONE_PH_EDUCATION_ANIMATION_STOP + 1) / 2
    );

    expect(atStop).toMatchObject({
      phProgress: 1,
      educationProgress: 0,
      phOpacity: 1,
      educationOpacity: 0
    });
    expect(midpoint.phProgress).toBe(1);
    expect(midpoint.educationProgress).toBeCloseTo(0.5, 8);
    expect(midpoint.phOpacity).toBeCloseTo(0.5, 8);
    expect(midpoint.educationOpacity).toBeCloseTo(0.5, 8);
  });

  it('keeps the Education receiver in native document flow at the stable endpoint', () => {
    const ph = new FakeElement();
    const education = new FakeElement();
    ph.dataset.r4Scene = 'ph-animation';
    education.dataset.r4Scene = 'education';

    const frame = applyPhonePhEducationFrame(
      ph as unknown as HTMLElement,
      education as unknown as HTMLElement,
      1
    );

    expect(frame.educationProgress).toBe(1);
    expect(education.dataset.phonePhEducationHandoff).toBe('receiver');
    expect(education.style.opacity).toBe('1.0000');
    expect(education.inert).toBe(false);
    expect(education.style.values.get('--r4-education-y')).toBe('0.00px');
  });

  it('returns through the same sampled frames and lands on Education after media failure', () => {
    const forward = [0, PHONE_PH_EDUCATION_ANIMATION_STOP, 1]
      .map((value) => phonePhEducationFrame(value));
    const reverse = [1, PHONE_PH_EDUCATION_ANIMATION_STOP, 0]
      .map((value) => phonePhEducationFrame(value));

    expect(forward.map(({ progress }) => progress)).toEqual(
      [...reverse.map(({ progress }) => progress)].reverse()
    );
    expect(phonePhEducationFallbackFrame()).toMatchObject({
      phProgress: 1,
      educationProgress: 1,
      educationOpacity: 1
    });
  });

  it('keeps the full ordered endpoint sequence under reduced motion', () => {
    expect(phonePhEducationFrame(0.49, true)).toMatchObject({
      phProgress: 0,
      educationProgress: 0
    });
    expect(phonePhEducationFrame(0.5, true)).toMatchObject({
      phProgress: 1,
      educationProgress: 1
    });
  });
});
