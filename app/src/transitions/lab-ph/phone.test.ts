import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeElement } from '../__fixtures__/back-half.fixture';
import {
  applyPhoneLabPhFrame,
  PHONE_LAB_PH_DECISION,
  phoneLabPhAlignedInkProgress,
  phoneLabPhFrame
} from './phone';

const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('./phone.css', import.meta.url), 'utf8');

function createLabExitFixture() {
  const lab = new FakeElement();
  const ph = new FakeElement();
  lab.dataset.phoneAdapterEndpoint = 'stable';
  ph.dataset.r4Scene = 'ph-animation';
  return { lab, ph };
}

describe('Phone Lab → PH transition', () => {
  it('uses the shared Lab endpoint with the reviewed Star-map → AOD ink field', () => {
    expect(PHONE_LAB_PH_DECISION).toMatchObject({
      mode: 'horizontal-ink',
      source: 'star-map-aod-phone-field',
      field: 'bottom-to-top',
      grade: 'edge-bright'
    });
    expect(source).not.toMatch(/from ['"].*PhoneLab/);
    expect(source).not.toMatch(/from ['"].*scenes\/lab/);
    expect(source).toContain('createPhoneInkTransition');
    expect(source).toContain("direction: 'bottom-to-top'");
    expect(source).toContain("grade: 'edge-bright'");
    expect(source).toContain("'data-phone-lab-ph-ink': 'bottom-to-top'");
    expect(source).toContain("host.dataset.phoneLabPhInkSurface = 'transparent'");
    expect(source).toContain('from: null');
    expect(source).toContain('phoneLabPhAlignedInkProgress(frame.progress)');
    expect(source).toContain('const releaseInk = useCallback');
    expect(source).toContain('ink.dispose()');
    expect(source).toContain('canvas.width = 1');
    expect(source).toMatch(/leave\(\) \{\s*render\(1\);\s*releaseInk\(\);/);
    expect(stylesheet).toContain('data-phone-lab-ph-ink-surface="transparent"');
    expect(stylesheet).toContain('background: transparent');
    expect(source).not.toContain('preparePhAnimationFrame');
    expect(source).not.toContain('parkPhonePhMedia');
  });

  it('aligns the shared field gate to the native Lab bottom edge', () => {
    expect(phoneLabPhAlignedInkProgress(0)).toBe(0);
    expect(phoneLabPhAlignedInkProgress(0.25)).toBeCloseTo(0.28, 8);
    expect(phoneLabPhAlignedInkProgress(0.5)).toBeCloseTo(0.5, 8);
    expect(phoneLabPhAlignedInkProgress(0.75)).toBeCloseTo(0.72, 8);
    expect(phoneLabPhAlignedInkProgress(1)).toBe(1);
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
      labOpacity: 1,
      phOpacity: 1,
      phProgress: 0
    });
    expect(lab.dataset.phoneLabPhHandoff).toBe('source');
    expect(ph.dataset.phoneLabPhHandoff).toBe('receiver');
    expect(lab.style.opacity).toBe('1');
    expect(ph.style.opacity).toBe('1');
    expect(lab.inert).toBe(false);
    expect(ph.inert).toBe(true);
    expect(ph.dataset.phonePhProgress).toBe('0.0000');
    expect(ph.style.values.get('--ph-video-opacity')).toBe('1');
  });

  it('is continuous forward and reverse with no hidden middle hold', () => {
    const forward = [0, 0.25, 0.5, 0.75, 1].map((value) => phoneLabPhFrame(value));
    const reverse = [1, 0.75, 0.5, 0.25, 0].map((value) => phoneLabPhFrame(value));

    expect(forward.map(({ progress }) => progress)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(reverse.map(({ progress }) => progress)).toEqual([1, 0.75, 0.5, 0.25, 0]);
    expect(forward[2]).toMatchObject({ labOpacity: 1, phOpacity: 1 });
  });

  it('keeps the same ordered endpoints under reduced motion', () => {
    expect(phoneLabPhFrame(0.49, true)).toMatchObject({
      labOpacity: 1,
      phOpacity: 1
    });
    expect(phoneLabPhFrame(0.5, true)).toMatchObject({
      labOpacity: 1,
      phOpacity: 1
    });
  });
});
