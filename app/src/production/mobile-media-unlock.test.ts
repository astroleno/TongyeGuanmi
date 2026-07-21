import { describe, expect, it, vi } from 'vitest';
import {
  attachStoryMediaUnlock,
  unlockStoryMedia
} from './mobile-media-unlock';

type FakeVideo = {
  dataset: Record<string, string>;
  paused: boolean;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
};

function mediaRoot(...videos: readonly FakeVideo[]): ParentNode {
  return {
    querySelectorAll: () => videos
  } as unknown as ParentNode;
}

function video(play: FakeVideo['play'] = vi.fn(() => Promise.resolve())): FakeVideo {
  return {
    dataset: {},
    paused: true,
    pause: vi.fn(),
    play
  };
}

describe('mobile media unlock', () => {
  it('starts media inside the caller gesture and pauses after activation', async () => {
    const target = video();

    unlockStoryMedia(mediaRoot(target));

    expect(target.play).toHaveBeenCalledOnce();

    await Promise.resolve();

    expect(target.pause).toHaveBeenCalledOnce();
    unlockStoryMedia(mediaRoot(target));
    expect(target.play).toHaveBeenCalledOnce();
  });

  it('allows a later touch gesture to retry a rejected activation', async () => {
    const target = video(vi.fn(() => Promise.reject(new Error('gesture required'))));

    unlockStoryMedia(mediaRoot(target));
    await Promise.resolve();
    await Promise.resolve();

    unlockStoryMedia(mediaRoot(target));
    expect(target.play).toHaveBeenCalledTimes(2);
  });

  it('does not interrupt media that is already playing', () => {
    const target = video();
    target.paused = false;

    unlockStoryMedia(mediaRoot(target));

    expect(target.play).not.toHaveBeenCalled();
    expect(target.pause).not.toHaveBeenCalled();
  });

  it('does not pause media after a timeline run takes ownership', async () => {
    let resolvePlayback: () => void = () => undefined;
    const target = video(vi.fn(() => new Promise<void>((resolve) => {
      resolvePlayback = resolve;
    })));
    target.dataset.timelineVideoRun = 'prewarm';

    unlockStoryMedia(mediaRoot(target));
    target.dataset.timelineVideoRun = 'hero-pattern:1';
    resolvePlayback();
    await Promise.resolve();

    expect(target.pause).not.toHaveBeenCalled();
  });

  it('rescans lazy media directly on touchstart and touchmove', () => {
    const target = video();
    const listeners = new Map<string, EventListener>();
    const root = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn(),
      querySelectorAll: () => [target]
    } as unknown as HTMLElement;

    const detach = attachStoryMediaUnlock(root);
    listeners.get('touchmove')?.(new Event('touchmove'));

    expect(target.play).toHaveBeenCalledOnce();
    expect(root.addEventListener).toHaveBeenCalledWith(
      'touchstart',
      expect.any(Function),
      { passive: true }
    );
    expect(root.addEventListener).toHaveBeenCalledWith(
      'touchmove',
      expect.any(Function),
      { passive: true }
    );

    detach();
    expect(root.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
