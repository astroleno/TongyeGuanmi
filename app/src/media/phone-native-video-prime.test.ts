// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { primePhoneNativeVideo } from './phone-native-video-prime';

describe('primePhoneNativeVideo', () => {
  it('does not let a late prime settlement pause a formally playing generation', async () => {
    const video = document.createElement('video');
    const events: string[] = [];
    let release!: () => void;
    vi.spyOn(video, 'play').mockImplementation(() => {
      events.push('play');
      return new Promise<void>((resolve) => {
        release = () => {
          events.push('resolve');
          resolve();
        };
      });
    });
    vi.spyOn(video, 'pause').mockImplementation(() => {
      events.push('pause');
    });

    let phase: 'primed' | 'playing' = 'primed';
    const settlement = primePhoneNativeVideo(video, {
      isCurrent: () => true,
      phase: () => phase
    });
    expect(events).toEqual(['play', 'pause']);

    await settlement;
    expect(events).toEqual(['play', 'pause']);

    phase = 'playing';
    release();
    await Promise.resolve();
    expect(events).toEqual(['play', 'pause', 'resolve']);
  });

  it('reports an active NotAllowedError instead of consuming it', async () => {
    const video = document.createElement('video');
    const error = new DOMException('autoplay blocked', 'NotAllowedError');
    vi.spyOn(video, 'play').mockRejectedValue(error);
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const onRejected = vi.fn();

    const settlement = primePhoneNativeVideo(video, {
      isCurrent: () => true,
      phase: () => 'primed',
      onRejected
    });

    expect(pause).toHaveBeenCalledOnce();
    await settlement;
    await Promise.resolve();
    expect(onRejected).toHaveBeenCalledWith(error);
  });

  it('ignores only a stale AbortError caused by the prime pause', async () => {
    const video = document.createElement('video');
    const error = new DOMException('play interrupted', 'AbortError');
    vi.spyOn(video, 'play').mockRejectedValue(error);
    vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const onRejected = vi.fn();

    const settlement = primePhoneNativeVideo(video, {
      isCurrent: () => true,
      phase: () => 'primed',
      onRejected
    });

    await settlement;
    await Promise.resolve();
    expect(onRejected).not.toHaveBeenCalled();
  });
});
