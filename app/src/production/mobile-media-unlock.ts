const storyMediaUnlock = Symbol();

type UnlockableVideo = HTMLVideoElement & {
  [storyMediaUnlock]?: string;
};

/**
 * iOS may ignore preload on cellular connections until media playback starts
 * inside a user gesture. Call this function directly from click/touch handlers;
 * moving it behind a timer or awaited import loses the activation token.
 */
export function unlockStoryMedia(
  root: ParentNode = document
): void {
  for (const video of root.querySelectorAll<UnlockableVideo>('video')) {
    if (!video.paused || video[storyMediaUnlock]) {
      continue;
    }
    video[storyMediaUnlock] = video.dataset.timelineVideoRun || '-';
    try {
      void video.play().then(
        () => {
          if (video[storyMediaUnlock] === (video.dataset.timelineVideoRun || '-')) {
            video.pause();
          }
          video[storyMediaUnlock] = '1';
        },
        () => {
          delete video[storyMediaUnlock];
        }
      );
    } catch {
      delete video[storyMediaUnlock];
    }
  }
}

/**
 * Re-scan mounted story media during every physical touch. Lazy phone scenes
 * can mount after touchstart, so touchmove must retain the same direct gesture
 * path instead of waiting for a later effect or timer.
 */
export function attachStoryMediaUnlock(
  root: HTMLElement | null
): () => void {
  if (!root) return () => undefined;
  const unlockMountedMedia = () => unlockStoryMedia(root);
  root.addEventListener('touchstart', unlockMountedMedia, { passive: true });
  root.addEventListener('touchmove', unlockMountedMedia, { passive: true });
  return () => {
    root.removeEventListener('touchstart', unlockMountedMedia);
    root.removeEventListener('touchmove', unlockMountedMedia);
  };
}
