import { describe, expect, it, vi } from 'vitest';
import { attachPhoneMediaGestureLease } from './phone-media-gesture-lease';

describe('phone media gesture lease', () => {
  it('retries only the route-owned active transaction during a gesture', () => {
    const listeners = new Map<string, EventListener>();
    const root = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn()
    } as unknown as HTMLElement;
    const retry = vi.fn(() => true);

    const dispose = attachPhoneMediaGestureLease(root, retry);
    listeners.get('pointerdown')?.(new Event('pointerdown'));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(root.addEventListener).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      { passive: true }
    );

    dispose();
    expect(root.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
