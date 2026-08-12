import { readFileSync } from 'node:fs';
import { gsap } from 'gsap/gsap-core';
import { describe, expect, it, vi } from 'vitest';
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

function fakeReadingTarget(): readonly [HTMLOListElement, readonly HTMLElement[]] {
  const steps = [fakeTarget(), fakeTarget(), fakeTarget()];
  return [
    {
      querySelectorAll: () => steps
    } as unknown as HTMLOListElement,
    steps
  ];
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

  it('keeps Method reading steps visible until their trigger actually starts', () => {
    const [target, steps] = fakeReadingTarget();
    const to = vi.spyOn(gsap, 'to').mockReturnValue({
      scrollTrigger: { kill: vi.fn() },
      kill: vi.fn()
    } as never);

    const dispose = phoneMotionDriver.revealReadingSteps(target);

    for (const step of steps) {
      expect(step.style.opacity).toBe('');
      expect(step.style.translate).toBe('');
    }
    dispose();
    to.mockRestore();
  });

  it('registers ScrollTrigger on the same lightweight core as the style driver', () => {
    expect(driverSource).toContain("from 'gsap/gsap-core'");
    expect(runtimeSource).toContain("from 'gsap/gsap-core'");
    expect(runtimeSource).toContain("from 'gsap/ScrollTrigger'");
    expect(runtimeSource).toContain('gsap.registerPlugin(ScrollTrigger)');
    expect(runtimeSource.indexOf('if (!phoneGsapUtils.checkPrefix)'))
      .toBeLessThan(runtimeSource.indexOf('gsap.registerPlugin(ScrollTrigger)'));
    expect(runtimeSource).not.toContain('phoneGsapUtils.checkPrefix ??=');
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
