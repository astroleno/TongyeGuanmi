import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeElement } from '../__fixtures__/back-half.fixture';
import {
  applyPhoneLabPhFrame,
  PHONE_LAB_PH_DECISION,
  phoneLabPhFrame
} from './phone';

const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');

function createLabExitFixture() {
  const lab = new FakeElement();
  const ph = new FakeElement();
  lab.dataset.phoneAdapterEndpoint = 'stable';
  ph.dataset.r4Scene = 'ph-animation';
  return { lab, ph };
}

describe('Phone Lab → PH transition', () => {
  it('uses the shared endpoint handoff and a documented dissolve fallback', () => {
    expect(PHONE_LAB_PH_DECISION).toMatchObject({
      mode: 'endpoint-dissolve',
      source: 'shared-adapter-handoff'
    });
    expect(source).not.toMatch(/from ['"].*PhoneLab/);
    expect(source).not.toMatch(/from ['"].*scenes\/lab/);
    expect(source).not.toContain('<canvas');
    expect(source).not.toContain('preparePhAnimationFrame');
    expect(source).not.toContain('parkPhonePhMedia');
  });

  it('accepts a lightweight stable Lab outlet fixture without Lab JSX or refs', () => {
    const { lab, ph } = createLabExitFixture();
    const midpoint = applyPhoneLabPhFrame(
      lab as unknown as HTMLElement,
      ph as unknown as HTMLElement,
      0.5
    );

    expect(midpoint).toEqual({
      progress: 0.5,
      labOpacity: 0.5,
      phOpacity: 0.5,
      phProgress: 0
    });
    expect(lab.dataset.phoneLabPhHandoff).toBe('source');
    expect(ph.dataset.phoneLabPhHandoff).toBe('receiver');
    expect(lab.style.opacity).toBe('0.5000');
    expect(ph.style.opacity).toBe('0.5000');
  });

  it('is continuous forward and reverse with no hidden middle hold', () => {
    const forward = [0, 0.25, 0.5, 0.75, 1].map((value) => phoneLabPhFrame(value));
    const reverse = [1, 0.75, 0.5, 0.25, 0].map((value) => phoneLabPhFrame(value));

    expect(forward.map(({ progress }) => progress)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(reverse.map(({ progress }) => progress)).toEqual([1, 0.75, 0.5, 0.25, 0]);
    expect(forward[2]).toMatchObject({ labOpacity: 0.5, phOpacity: 0.5 });
  });

  it('keeps the same ordered endpoints under reduced motion', () => {
    expect(phoneLabPhFrame(0.49, true)).toMatchObject({
      labOpacity: 1,
      phOpacity: 0
    });
    expect(phoneLabPhFrame(0.5, true)).toMatchObject({
      labOpacity: 0,
      phOpacity: 1
    });
  });
});
