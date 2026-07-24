import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeElement } from '../__fixtures__/back-half.fixture';
import {
  applyPhonePhEducationFrame,
  applyPhonePhEducationReverseFrame,
  PHONE_PH_EDUCATION_ANIMATION_STOP,
  PHONE_PH_EDUCATION_DECISION,
  PHONE_PH_EDUCATION_DISSOLVE_MS,
  PHONE_PH_EDUCATION_PLAYBACK_MS,
  phonePhEducationFallbackFrame,
  phonePhEducationFrame,
  settlePhonePhEducationDocumentFlow
} from './phone';

const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');

describe('Phone PH → Education transition', () => {
  it('documents the terminal-PH plus native-Education dissolve decision', () => {
    expect(PHONE_PH_EDUCATION_DECISION).toMatchObject({
      mode: 'endpoint-dissolve',
      source: '4b861b58-ttg-lab-overlay-dissolve',
      topology: 'education-receiver-over-retained-ph-source',
      endpointPolicy: 'persistent-endpoint-opacity'
    });
    expect(PHONE_PH_EDUCATION_PLAYBACK_MS).toBe(1520);
    expect(PHONE_PH_EDUCATION_DISSOLVE_MS).toBe(600);
    expect(source).not.toContain('<canvas');
    expect(source).not.toMatch(/createPhoneInk/);
    expect(source).not.toContain('preparePhAnimationFrame');
    expect(source).not.toContain('parkPhonePhMedia');
    expect(source).not.toContain('renderPhonePhAnimationProgress');
    expect(source).toContain('setEducationDocumentLayer');
  });

  it('maps the canonical PH clock before the short Education dissolve', () => {
    const atStart = phonePhEducationFrame(0);
    const atAnimationStop = phonePhEducationFrame(
      PHONE_PH_EDUCATION_ANIMATION_STOP
    );
    const dissolveMidpoint = (
      PHONE_PH_EDUCATION_ANIMATION_STOP + 1
    ) / 2;
    const midpoint = phonePhEducationFrame(dissolveMidpoint);

    expect(atStart).toMatchObject({
      phProgress: 0,
      educationProgress: 0,
      phOpacity: 1,
      educationOpacity: 0
    });
    expect(atAnimationStop).toMatchObject({
      phProgress: 1,
      educationProgress: 0
    });
    expect(midpoint.phProgress).toBe(1);
    expect(midpoint.educationProgress).toBeCloseTo(0.5, 8);
    expect(midpoint.phOpacity).toBe(1);
    expect(midpoint.educationOpacity).toBeCloseTo(0.5, 8);

    const ph = new FakeElement();
    const education = new FakeElement();
    ph.dataset.r4Scene = 'ph-animation';
    education.dataset.r4Scene = 'education';
    applyPhonePhEducationFrame(
      ph as unknown as HTMLElement,
      education as unknown as HTMLElement,
      dissolveMidpoint
    );
    expect(education.style.values.get('--r4-education-opacity')).toBe('1.0000');
    expect(ph.style.values.get('--ph-front-parallax-y')).toBe('135.00px');
    expect(ph.style.values.get('--ph-video-opacity')).toBe('1');
    expect(ph.style.opacity).toBe('1.0000');
    expect(education.style.opacity).toBe('0.5000');
    expect(ph.dataset.phonePhEducationFadeOwner).toBe('scene-root');
    expect(education.dataset.phonePhEducationFadeOwner).toBe('scene-root');
  });

  it('commits native Education while preserving both reverse compositor endpoints', () => {
    const ph = new FakeElement();
    const education = new FakeElement();
    ph.style.opacity = '1.0000';
    education.style.opacity = '1.0000';

    settlePhonePhEducationDocumentFlow(
      ph as unknown as HTMLElement,
      education as unknown as HTMLElement
    );

    expect(ph.style.opacity).toBe('0.0000');
    expect(ph.style.visibility).toBe('visible');
    expect(education.style.opacity).toBe('1.0000');
    expect(education.style.visibility).toBe('visible');
    expect(education.inert).toBe(false);

    settlePhonePhEducationDocumentFlow(
      ph as unknown as HTMLElement,
      education as unknown as HTMLElement
    );
    expect(education.style.opacity).toBe('1.0000');
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
    const forward = [0, 0.5, 1]
      .map((value) => phonePhEducationFrame(value));
    const reverse = [1, 0.5, 0]
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

  it('lets PhonePh own reverse motion while Education fades away', () => {
    const ph = new FakeElement();
    const education = new FakeElement();
    ph.style.values.set('--ph-front-parallax-y', '135.00px');

    const midpoint = applyPhonePhEducationReverseFrame(
      education as unknown as HTMLElement,
      (PHONE_PH_EDUCATION_ANIMATION_STOP + 1) / 2
    );

    expect(midpoint.educationOpacity).toBeCloseTo(0.5, 8);
    expect(education.style.opacity).toBe('0.5000');
    expect(ph.style.values.get('--ph-front-parallax-y')).toBe('135.00px');
    expect(source).toContain('directionRef.current === -1');
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
