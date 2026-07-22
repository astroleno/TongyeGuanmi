import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeElement } from '../__fixtures__/back-half.fixture';
import {
  applyPhoneEducationCraneFrame,
  PHONE_EDUCATION_CRANE_DECISION,
  phoneEducationCraneFrame
} from './phone';

const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');

describe('Phone Education → Crane transition', () => {
  it('records the stable-endpoint dissolve instead of an unverified camera', () => {
    expect(PHONE_EDUCATION_CRANE_DECISION).toMatchObject({
      mode: 'endpoint-dissolve',
      source: 'canonical-endpoints'
    });
    expect(source).not.toContain('<canvas');
    expect(source).not.toMatch(/createPhoneInk/);
    expect(source).not.toContain('prepareCraneAnimationFrame');
    expect(source).not.toContain('parkPhoneCraneMedia');
  });

  it('dissolves stable Education directly to the stable Crane frame', () => {
    const education = new FakeElement();
    const crane = new FakeElement();
    education.dataset.r4Scene = 'education';
    crane.dataset.r4Scene = 'crane-animation';

    const midpoint = applyPhoneEducationCraneFrame(
      education as unknown as HTMLElement,
      crane as unknown as HTMLElement,
      0.5
    );

    expect(midpoint).toEqual({
      progress: 0.5,
      educationOpacity: 0.5,
      craneOpacity: 0.5
    });
    expect(education.dataset.phoneEducationCraneHandoff).toBe('source');
    expect(crane.dataset.phoneEducationCraneHandoff).toBe('receiver');
  });

  it('maps forward, reverse, and reduced motion without an intermediate hold', () => {
    expect([0, 0.5, 1].map((value) => phoneEducationCraneFrame(value))).toEqual([
      { progress: 0, educationOpacity: 1, craneOpacity: 0 },
      { progress: 0.5, educationOpacity: 0.5, craneOpacity: 0.5 },
      { progress: 1, educationOpacity: 0, craneOpacity: 1 }
    ]);
    expect(phoneEducationCraneFrame(0.49, true)).toMatchObject({
      educationOpacity: 1,
      craneOpacity: 0
    });
    expect(phoneEducationCraneFrame(0.5, true)).toMatchObject({
      educationOpacity: 0,
      craneOpacity: 1
    });
  });
});
