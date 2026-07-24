import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneMotionDriver } from './phone-gsap-driver';

const driverSource = readFileSync(
  new URL('./phone-gsap-driver.ts', import.meta.url),
  'utf8'
);
const runtimeSource = readFileSync(
  new URL('./usePhoneStageRuntime.ts', import.meta.url),
  'utf8'
);

function fakeTarget(): HTMLElement {
  return {
    style: {
      filter: '',
      opacity: '',
      scale: '',
      translate: '',
      visibility: ''
    }
  } as unknown as HTMLElement;
}

describe('phone GSAP core driver', () => {
  it('preserves transform components across direct frame updates', () => {
    const target = fakeTarget();

    phoneMotionDriver.set(target, {
      x: 12,
      y: -8,
      yPercent: 25,
      scale: 1.2,
      autoAlpha: 0,
      filter: 'blur(4px)'
    });

    expect(target.style.translate).toBe('12px calc(-8px + 25%)');
    expect(target.style.scale).toBe('1.2');
    expect(target.style.opacity).toBe('0');
    expect(target.style.visibility).toBe('hidden');
    expect(target.style.filter).toBe('blur(4px)');

    phoneMotionDriver.set(target, { y: 5, opacity: 0.4 });

    expect(target.style.translate).toBe('12px calc(5px + 25%)');
    expect(target.style.scale).toBe('1.2');
    expect(target.style.opacity).toBe('0.4');
  });

  it('keeps ScrollTrigger while excluding CSSPlugin and the React GSAP wrapper', () => {
    expect(driverSource).toContain("from 'gsap/gsap-core'");
    expect(runtimeSource).toContain("from 'gsap/gsap-core'");
    expect(runtimeSource).toContain("from 'gsap/ScrollTrigger'");
    expect(driverSource).not.toContain("from 'gsap'");
    expect(runtimeSource).not.toContain('@gsap/react');
    expect(driverSource).toContain("gsap.quickTo(state, 'value'");
  });
});
