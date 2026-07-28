import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeElement } from '../__fixtures__/back-half.fixture';
import {
  applyPhoneEducationCraneFrame,
  PHONE_EDUCATION_CRANE_DECISION,
  PHONE_EDUCATION_CRANE_FIELD,
  phoneEducationCraneFrame
} from './contract';

const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('./phone.css', import.meta.url), 'utf8');

describe('Phone Education → Crane transition', () => {
  it('reuses Unit 5’s reviewed bottom-to-top phone ink ownership', () => {
    expect(PHONE_EDUCATION_CRANE_DECISION).toMatchObject({
      mode: 'horizontal-ink',
      source: 'services-ttg/star-map-aod-phone-field',
      field: 'bottom-to-top',
      grade: 'edge-bright'
    });
    expect(PHONE_EDUCATION_CRANE_FIELD).toMatchObject({
      kind: 'horizontal',
      direction: 'bottom-to-top'
    });
    expect(source).toMatch(
      /const field = \[\s*'horizontal',\s*'phone-education-crane-r5',\s*'bottom-to-top',\s*null,\s*null\s*\] as const satisfies PhoneInkFieldRequest;/s
    );
    expect(source).toMatch(
      /createPhoneInkAdapter\(\[\s*'phone-education-crane-ink',\s*field,\s*'edge-bright',\s*'phone-education-crane__ink',\s*null,\s*null,\s*false,\s*null,/s
    );
    expect(source).not.toMatch(/\b(?:direction|grade|maskSource|releaseOnLeave)\s*:/);
    expect(source).not.toContain('reverseProgress');
    expect(source).toContain('renderPhoneCranePresentation');
    expect(stylesheet).toContain('phone-education-crane__ink');
    expect(stylesheet).toContain(
      'height: var(--phone-cinematic-stage-canvas-height, 100lvh)'
    );
    expect(source).not.toContain('prepareCraneAnimationFrame');
    expect(source).not.toContain('parkPhoneCraneMedia');
  });

  it('keeps both authored endpoints opaque while the contour owns visibility', () => {
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
      educationOpacity: 1,
      craneOpacity: 1,
      craneProgress: 0
    });
    expect(education.dataset.phoneEducationCraneHandoff).toBe('source');
    expect(crane.dataset.phoneEducationCraneHandoff).toBe('receiver');
    expect(education.style.opacity).toBe('1');
    expect(crane.style.opacity).toBe('1');
    expect(education.inert).toBe(false);
    expect(crane.inert).toBe(true);
    expect(crane.dataset.phoneCraneProgress).toBe('0.0000');
    expect(
      crane.style.values.get('--phone-crane-flock-motion-scale')
    ).toBe('0.5700');
  });

  it('maps forward, reverse, and reduced motion without a dissolve or hold', () => {
    expect([0, 0.5, 1].map((value) => phoneEducationCraneFrame(value))).toEqual([
      {
        progress: 0,
        educationOpacity: 1,
        craneOpacity: 1,
        craneProgress: 0
      },
      {
        progress: 0.5,
        educationOpacity: 1,
        craneOpacity: 1,
        craneProgress: 0
      },
      {
        progress: 1,
        educationOpacity: 1,
        craneOpacity: 1,
        craneProgress: 0
      }
    ]);
    expect(phoneEducationCraneFrame(0.49, true).progress).toBe(0);
    expect(phoneEducationCraneFrame(0.5, true).progress).toBe(1);
  });

  it('does not rewind a Crane terminal frame while reverse ink is prepared', () => {
    const education = new FakeElement();
    const crane = new FakeElement();
    education.dataset.r4Scene = 'education';
    crane.dataset.r4Scene = 'crane-animation';
    crane.dataset.phoneCraneProgress = '1.0000';

    applyPhoneEducationCraneFrame(
      education as unknown as HTMLElement,
      crane as unknown as HTMLElement,
      1
    );

    expect(crane.dataset.phoneCraneProgress).toBe('1.0000');
  });
});
