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

  it('uses one cancelable native rAF tween for visual-only motion', () => {
    const originalRequest = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    const frames = new Map<number, FrameRequestCallback>();
    const cancelled = new Set<number>();
    let nextFrame = 1;
    globalThis.requestAnimationFrame = (callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      cancelled.add(id);
    };
    try {
      const target = fakeTarget();
      const setX = phoneMotionDriver.quickTo(target, 'x', {
        duration: .1,
        ease: 'power3.out'
      });
      setX(12);
      const staleFrame = nextFrame - 1;
      setX(28);
      const currentFrame = nextFrame - 1;

      expect(cancelled).toContain(staleFrame);
      frames.get(staleFrame)?.(0);
      expect(target.style.translate).toBe('');

      frames.get(currentFrame)?.(0);
      frames.get(nextFrame - 1)?.(100);
      expect(target.style.translate).toBe('28px calc(0px + 0%)');
    } finally {
      if (originalRequest) globalThis.requestAnimationFrame = originalRequest;
      else delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame;
      if (originalCancel) globalThis.cancelAnimationFrame = originalCancel;
      else delete (globalThis as Partial<typeof globalThis>).cancelAnimationFrame;
    }

    expect(driverSource).not.toContain("from 'gsap/gsap-core'");
    expect(driverSource).not.toContain("from 'gsap'");
    expect(driverSource).not.toContain('scrollTrigger:');
    expect(driverSource).toContain('requestAnimationFrame');
    expect(driverSource).toContain('cancelAnimationFrame');
    expect(runtimeSource).not.toContain("from 'gsap/ScrollTrigger'");
    expect(phoneStageScrollBounds(1200, -200, 2400)).toEqual([1000, 3400]);
    expect(phoneStageScrollBounds(0, 80, 0)).toEqual([80, 81]);
    expect(runtimeSource).not.toContain('@gsap/react');
  });
});
