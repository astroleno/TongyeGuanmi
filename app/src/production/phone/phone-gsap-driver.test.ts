import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneMotionDriver } from './phone-gsap-driver';
import { phoneGsapCheckPrefix } from './usePhoneStageRuntime';

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

  it('registers ScrollTrigger on the same lightweight core as the style driver', () => {
    expect(driverSource).toContain("from 'gsap/gsap-core'");
    expect(runtimeSource).toContain("from 'gsap/gsap-core'");
    expect(runtimeSource).toContain("from 'gsap/ScrollTrigger'");
    expect(runtimeSource).toContain('gsap.registerPlugin(ScrollTrigger)');
    expect(runtimeSource.indexOf('phoneGsapUtils.checkPrefix ??='))
      .toBeLessThan(runtimeSource.indexOf('gsap.registerPlugin(ScrollTrigger)'));
    expect(driverSource).not.toContain("from 'gsap'");
    expect(runtimeSource).not.toContain('@gsap/react');
    expect(driverSource).toContain("gsap.quickTo(state, 'value'");
  });

  it('supplies the CSS prefix lookup ScrollTrigger expects from full GSAP', () => {
    expect(phoneGsapCheckPrefix('transform', { transform: '' }))
      .toBe('transform');
    expect(phoneGsapCheckPrefix('transform', { WebkitTransform: '' }))
      .toBe('WebkitTransform');
    expect(phoneGsapCheckPrefix('transform', {})).toBe('transform');
  });
});
