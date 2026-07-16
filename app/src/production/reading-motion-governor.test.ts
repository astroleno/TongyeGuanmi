import { describe, expect, it } from 'vitest';
import {
  createReadingMotionGovernor,
  READING_WHEEL_DAMPING,
  READING_WHEEL_EVENT_CAP_VIEWPORT,
  READING_WHEEL_GESTURE_BUDGET_VIEWPORT
} from './reading-motion-governor';

describe('reading motion governor', () => {
  it('keeps a representative wheel burst within one controlled viewport budget', () => {
    const governor = createReadingMotionGovernor();
    const viewportHeight = 900;
    const burst = [180, 130, 90, 50, 25, 10];
    const effective = burst.map((pixels, index) => governor.consume({
      scope: 'reading:figure2-proof',
      source: 'wheel',
      pixels,
      viewportHeight,
      newGesture: index === 0
    }).pixels);
    const displacement = effective.reduce((sum, pixels) => sum + pixels, 0);

    expect(displacement).toBeGreaterThan(viewportHeight * 0.35);
    expect(displacement).toBeLessThan(viewportHeight * 0.65);

    const tail = [500, 500, 500, 40, 40].map((pixels) => governor.consume({
      scope: 'reading:figure2-proof',
      source: 'wheel',
      pixels,
      viewportHeight,
      newGesture: false
    }));
    expect(displacement + tail.reduce((sum, result) => sum + result.pixels, 0)).toBeLessThanOrEqual(
      viewportHeight * READING_WHEEL_GESTURE_BUDGET_VIEWPORT
    );
    expect(tail.at(-1)).toMatchObject({ pixels: 0, absorbed: true, remainingPixels: 0 });
  });

  it('uses the one-viewport reading budget without raising the per-event cap', () => {
    expect(READING_WHEEL_GESTURE_BUDGET_VIEWPORT).toBe(1.05);
    expect(READING_WHEEL_DAMPING).toBe(0.88);
    expect(READING_WHEEL_EVENT_CAP_VIEWPORT).toBe(0.18);
  });

  it('resets the wheel budget for a new physical gesture or direction, without touching touch and key input', () => {
    const governor = createReadingMotionGovernor();
    const first = governor.consume({
      scope: 'reading:lab', source: 'wheel', pixels: 320, viewportHeight: 1000, newGesture: true
    });
    const reverse = governor.consume({
      scope: 'reading:lab', source: 'wheel', pixels: -100, viewportHeight: 1000, newGesture: false
    });
    const touch = governor.consume({
      scope: 'reading:lab', source: 'touch', pixels: 100, viewportHeight: 1000, newGesture: true
    });
    const key = governor.consume({
      scope: 'reading:lab', source: 'key', pixels: 100, viewportHeight: 1000, newGesture: true
    });

    expect(first.pixels).toBe(180);
    expect(reverse).toMatchObject({ pixels: -88, absorbed: false, remainingPixels: 962 });
    expect(touch).toMatchObject({ pixels: 100, absorbed: false });
    expect(key).toMatchObject({ pixels: 100, absorbed: false });
  });
});
