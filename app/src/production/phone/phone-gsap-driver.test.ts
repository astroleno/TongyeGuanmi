import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneMotionDriver } from './phone-gsap-driver';
import { phoneStageScrollBounds } from './usePhoneStageRuntime';

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

describe('phone GSAP runtime and core driver', () => {
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

  it('keeps GSAP local to motion and derives stage ranges from native geometry', () => {
    expect(driverSource).toContain("from 'gsap/gsap-core'");
    expect(driverSource).not.toContain("from 'gsap'");
    expect(driverSource).not.toContain('scrollTrigger:');
    expect(runtimeSource).not.toContain("from 'gsap/ScrollTrigger'");
    expect(phoneStageScrollBounds(1200, -200, 2400)).toEqual([1000, 3400]);
    expect(phoneStageScrollBounds(0, 80, 0)).toEqual([80, 81]);
    expect(runtimeSource).not.toContain('@gsap/react');
    expect(driverSource).toContain("gsap.quickTo(state, 'value'");
  });
});
