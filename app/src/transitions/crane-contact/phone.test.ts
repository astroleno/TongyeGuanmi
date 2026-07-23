import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeElement } from '../__fixtures__/back-half.fixture';
import {
  applyPhoneCraneContactFrame,
  PHONE_CRANE_CONTACT_COPY_CUE,
  PHONE_CRANE_CONTACT_DECISION,
  phoneCraneContactFallbackFrame,
  phoneCraneContactFrame,
  settlePhoneCraneContactDocumentFlow
} from './phone';

const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('./phone.css', import.meta.url), 'utf8');

describe('Phone Crane → Contact transition', () => {
  it('uses the canonical manifest cue with an endpoint/dissolve fallback', () => {
    expect(PHONE_CRANE_CONTACT_DECISION).toMatchObject({
      mode: 'endpoint-dissolve',
      source: 'desktop-crane-contact-copy-cue',
      topology: 'shared-boundary-contact-receiver-over-retained-crane-source'
    });
    expect(PHONE_CRANE_CONTACT_COPY_CUE).toMatchObject({
      targetScene: 'contact',
      atProgress: 0.8
    });
    expect(source).not.toContain('<canvas');
    expect(source).not.toMatch(/createPhoneInk/);
    expect(source).not.toContain('prepareCraneAnimationFrame');
    expect(source).not.toContain('parkPhoneCraneMedia');
    expect(source).not.toContain('renderCraneAnimationProgress');
    expect(source).toContain('frame.contactProgress');
    expect(stylesheet).toContain('data-phone-crane-contact-layer="true"');
    expect(stylesheet).toContain('z-index: 4');
    expect(stylesheet).not.toContain('position: fixed');
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
      0.9,
      { interactiveEndpoint: false }
    );
    expect(contact.inert).toBe(true);
    const endpoint = applyPhoneCraneContactFrame(
      crane as unknown as HTMLElement,
      contact as unknown as HTMLElement,
      1
    );

    expect(beforeCue.copyCueActive).toBe(false);
    expect(dissolve).toMatchObject({
      copyCueActive: true,
      contactProgress: 0.5,
      craneOpacity: 1,
      contactOpacity: 1
    });
    expect(endpoint).toMatchObject({
      craneOpacity: 0,
      contactOpacity: 1,
      copyCueActive: true
    });
    expect(contact.inert).toBe(false);
    expect(contact.style.values.get('--r4-contact-opacity')).toBe('1.0000');
    expect(contact.style.values.get('--r4-contact-paper-alpha')).toBe('1.0000');
  });

  it('settles the fixed Contact receiver back into native document flow', () => {
    const crane = new FakeElement();
    const contact = new FakeElement();
    crane.style.opacity = '1.0000';
    contact.style.opacity = '1.0000';

    settlePhoneCraneContactDocumentFlow(
      crane as unknown as HTMLElement,
      contact as unknown as HTMLElement
    );

    expect(crane.style.opacity).toBe('0.0000');
    expect(crane.style.visibility).toBe('hidden');
    expect(contact.style.opacity).toBe('');
    expect(contact.inert).toBe(false);
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
