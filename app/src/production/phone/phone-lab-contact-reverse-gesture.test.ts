import { describe, expect, it, vi } from 'vitest';
import {
  attachPhoneLabContactReverseGesture
} from './phone-lab-contact-reverse-gesture';

type ListenerRoot = HTMLElement & {
  listeners: Map<string, EventListener>;
};

function listenerRoot(): ListenerRoot {
  const listeners = new Map<string, EventListener>();
  return {
    dataset: {},
    listeners,
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null
    ) {
      if (typeof listener === 'function') listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    }
  } as unknown as ListenerRoot;
}

function touches(identifier: number, clientY: number): TouchList {
  const touch = { identifier, clientY } as Touch;
  return {
    0: touch,
    length: 1,
    item: (index: number) => index === 0 ? touch : null
  } as unknown as TouchList;
}

describe('phone Lab → Contact reverse gesture', () => {
  it('starts the same Crane reverse run from a downward drag on the released edge', () => {
    const root = listenerRoot();
    const beginReverse = vi.fn(() => true);
    const gesture = attachPhoneLabContactReverseGesture({
      root,
      reducedMotion: false,
      hasActiveRun: () => false,
      sceneAtBoundary: () => 'crane-animation',
      beginReverse
    });
    const surface = { closest: () => null };

    root.listeners.get('touchstart')?.({
      target: surface,
      touches: touches(7, 200)
    } as unknown as Event);
    expect(root.dataset.phoneLabContactReverseGesture).toBe(
      'crane-animation:armed'
    );

    const move = {
      target: surface,
      touches: touches(7, 210),
      cancelable: true,
      preventDefault: vi.fn()
    };
    root.listeners.get('touchmove')?.(move as unknown as Event);

    expect(move.preventDefault).toHaveBeenCalledOnce();
    expect(beginReverse).toHaveBeenCalledOnce();
    expect(beginReverse).toHaveBeenCalledWith('crane-animation');
    expect(root.dataset.phoneLabContactReverseGesture).toBe(
      'crane-animation:started'
    );

    gesture.dispose();
    expect(root.listeners.size).toBe(0);
    expect(root.dataset.phoneLabContactReverseGesture).toBeUndefined();
  });

  it('does not arm from Contact CTA or while another cinematic owns input', () => {
    const root = listenerRoot();
    const beginReverse = vi.fn(() => true);
    const hasActiveRun = vi.fn(() => false);
    attachPhoneLabContactReverseGesture({
      root,
      reducedMotion: false,
      hasActiveRun,
      sceneAtBoundary: () => 'crane-animation',
      beginReverse
    });

    root.listeners.get('touchstart')?.({
      target: { closest: () => ({}) },
      touches: touches(4, 200)
    } as unknown as Event);
    root.listeners.get('touchmove')?.({
      target: { closest: () => ({}) },
      touches: touches(4, 220),
      cancelable: true,
      preventDefault: vi.fn()
    } as unknown as Event);
    expect(beginReverse).not.toHaveBeenCalled();

    hasActiveRun.mockReturnValue(true);
    root.listeners.get('pointerdown')?.({
      target: { closest: () => null },
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 9,
      clientY: 200
    } as unknown as Event);
    root.listeners.get('pointermove')?.({
      target: { closest: () => null },
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 9,
      clientY: 220
    } as unknown as Event);
    expect(beginReverse).not.toHaveBeenCalled();
  });
});
