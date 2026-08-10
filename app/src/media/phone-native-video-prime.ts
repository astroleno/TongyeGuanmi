/**
 * Establish native playback permission on the same video element that will
 * later own the formal media clock. The play call must happen synchronously
 * from the activation stack; the immediate pause keeps the decoder at its
 * prepared frame until runtime explicitly enters `playing`.
 */
export type PhoneNativeVideoPrimePhase = 'primed' | 'playing' | 'held';

export type PhoneNativeVideoPrimeOptions = Readonly<{
  /** Identifies the run/generation which still owns this prime. */
  isCurrent?: () => boolean;
  /** The media phase is sampled when the native play promise settles. */
  phase?: () => PhoneNativeVideoPrimePhase;
  /** Reports a live activation rejection without waiting on Safari's promise. */
  onRejected?: (error: unknown) => void;
}>;

function isAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object'
    && (error as { name?: unknown }).name === 'AbortError';
}

export function primePhoneNativeVideo(
  video: HTMLVideoElement,
  options: PhoneNativeVideoPrimeOptions = {}
): Promise<void> {
  let playback: Promise<void>;
  try {
    playback = Promise.resolve(video.play());
  } catch (error) {
    video.pause();
    return Promise.reject(error);
  }
  video.pause();
  // Safari may leave the play promise pending forever when the same call
  // stack pauses the element immediately. The synchronous play→pause pair is
  // the prime; activation must not wait for a promise whose settlement is
  // unrelated to the later formal media clock.
  void playback.then(
    () => {
      if ((options.isCurrent?.() ?? true)
        && (options.phase?.() ?? 'primed') === 'primed') {
        video.pause();
      }
    },
    (error: unknown) => {
      if ((options.isCurrent?.() ?? true)
        && (options.phase?.() ?? 'primed') === 'primed'
        && !isAbortError(error)) {
        options.onRejected?.(error);
      }
    }
  );
  return Promise.resolve();
}
