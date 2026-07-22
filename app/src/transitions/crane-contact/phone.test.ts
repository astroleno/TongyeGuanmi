import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeElement } from '../__fixtures__/back-half.fixture';
import {
  applyPhoneCraneContactFrame,
  PHONE_CRANE_CONTACT_COPY_CUE,
  PHONE_CRANE_CONTACT_DECISION,
  phoneCraneContactFallbackFrame,
  phoneCraneContactFrame
} from './phone';

const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');

describe('Phone Crane → Contact transition', () => {
  it('uses the canonical manifest cue with an endpoint/dissolve fallback', () => {
    expect(PHONE_CRANE_CONTACT_DECISION).toMatchObject({
      mode: 'endpoint-dissolve',
      source: 'manifest-copy-cue'
    });
    expect(PHONE_CRANE_CONTACT_COPY_CUE).toMatchObject({
      targetScene: 'contact',
      atProgress: 0.8
    });
    expect(source).not.toContain('<canvas');
    expect(source).not.toMatch(/createPhoneInk/);
    expect(source).not.toContain('prepareCraneAnimationFrame');
    expect(source).not.toContain('parkPhoneCraneMedia');
  });

  it('starts Contact at the shared cue and reaches one stable interactive endpoint', () => {
    const crane = new FakeElement();
    const contact = new FakeElement();
    crane.dataset.r4Scene = 'crane-animation';
    contact.dataset.r4Scene = 'contact';

    const beforeCue = phoneCraneContactFrame(0.79);
    const dissolve = applyPhoneCraneContactFrame(
      crane as unknown as HTMLElement,
      contact as unknown as HTMLElement,
      0.9
    );
    const endpoint = applyPhoneCraneContactFrame(
      crane as unknown as HTMLElement,
      contact as unknown as HTMLElement,
      1
    );

    expect(beforeCue.copyCueActive).toBe(false);
    expect(dissolve).toMatchObject({
      copyCueActive: true,
      contactProgress: 0.5,
      craneOpacity: 0.5,
      contactOpacity: 0.5
    });
    expect(endpoint).toMatchObject({
      craneOpacity: 0,
      contactOpacity: 1,
      copyCueActive: true
    });
    expect(contact.inert).toBe(false);
    expect(contact.style.values.get('--r4-contact-paper-alpha')).toBe('1.0000');
  });

  it('is reversible and directs media failure to the Contact endpoint', () => {
    const forward = [0, 0.8, 0.9, 1].map((value) => phoneCraneContactFrame(value));
    const reverse = [1, 0.9, 0.8, 0].map((value) => phoneCraneContactFrame(value));

    expect(forward.map(({ progress }) => progress)).toEqual(
      [...reverse.map(({ progress }) => progress)].reverse()
    );
    expect(phoneCraneContactFallbackFrame()).toMatchObject({
      craneProgress: 1,
      contactProgress: 1,
      contactOpacity: 1
    });
  });

  it('keeps full Contact order under reduced motion', () => {
    expect(phoneCraneContactFrame(0.49, true)).toMatchObject({
      craneOpacity: 1,
      contactOpacity: 0,
      copyCueActive: false
    });
    expect(phoneCraneContactFrame(0.5, true)).toMatchObject({
      craneOpacity: 0,
      contactOpacity: 1,
      copyCueActive: true
    });
  });
});
