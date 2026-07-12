export type LoaderInkPhase =
  | 'waiting'
  | 'revealing'
  | 'holding'
  | 'concealing'
  | 'gap'
  | 'complete';

export type LoaderInkTimings = Readonly<{
  startDelayMs: number;
  revealMs: number;
  holdMs: number;
  gapMs: number;
}>;

export type LoaderInkSample = Readonly<{
  phrase: string;
  phraseIndex: number;
  phase: LoaderInkPhase;
  progress: number;
  conceal: boolean;
  sequenceComplete: boolean;
}>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function loaderInkSequenceDuration(
  phrases: readonly string[],
  timings: LoaderInkTimings
): number {
  if (phrases.length === 0) {
    return 0;
  }
  const phraseMs = timings.revealMs * 2 + timings.holdMs;
  return timings.startDelayMs + phraseMs * phrases.length + timings.gapMs * (phrases.length - 1);
}

export function sampleLoaderInkSequence(
  elapsedMs: number,
  phrases: readonly string[],
  timings: LoaderInkTimings
): LoaderInkSample {
  const safePhrases = phrases.length > 0 ? phrases : [''];
  const elapsed = Math.max(0, elapsedMs);
  const phraseMs = timings.revealMs * 2 + timings.holdMs;
  const totalMs = loaderInkSequenceDuration(safePhrases, timings);

  if (elapsed < timings.startDelayMs) {
    return {
      phrase: safePhrases[0] ?? '',
      phraseIndex: 0,
      phase: 'waiting',
      progress: 0,
      conceal: false,
      sequenceComplete: false
    };
  }

  if (elapsed >= totalMs) {
    return {
      phrase: safePhrases.at(-1) ?? '',
      phraseIndex: safePhrases.length - 1,
      phase: 'complete',
      progress: 1,
      conceal: true,
      sequenceComplete: true
    };
  }

  let cursor = elapsed - timings.startDelayMs;
  for (let phraseIndex = 0; phraseIndex < safePhrases.length; phraseIndex += 1) {
    if (cursor < timings.revealMs) {
      return {
        phrase: safePhrases[phraseIndex] ?? '',
        phraseIndex,
        phase: 'revealing',
        progress: clamp01(cursor / timings.revealMs),
        conceal: false,
        sequenceComplete: false
      };
    }
    if (cursor < timings.revealMs + timings.holdMs) {
      return {
        phrase: safePhrases[phraseIndex] ?? '',
        phraseIndex,
        phase: 'holding',
        progress: 1,
        conceal: false,
        sequenceComplete: false
      };
    }
    if (cursor < phraseMs) {
      return {
        phrase: safePhrases[phraseIndex] ?? '',
        phraseIndex,
        phase: 'concealing',
        progress: clamp01((cursor - timings.revealMs - timings.holdMs) / timings.revealMs),
        conceal: true,
        sequenceComplete: false
      };
    }

    cursor -= phraseMs;
    if (phraseIndex < safePhrases.length - 1) {
      if (cursor < timings.gapMs) {
        return {
          phrase: safePhrases[phraseIndex] ?? '',
          phraseIndex,
          phase: 'gap',
          progress: 1,
          conceal: true,
          sequenceComplete: false
        };
      }
      cursor -= timings.gapMs;
    }
  }

  return {
    phrase: safePhrases.at(-1) ?? '',
    phraseIndex: safePhrases.length - 1,
    phase: 'complete',
    progress: 1,
    conceal: true,
    sequenceComplete: true
  };
}
