import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

export const LOADER_PHRASES = ['同人于野', '观象知幂'] as const;

export const STORY_LOADER_TIMINGS = {
  startDelayMs: 180,
  revealMs: 1_150,
  holdMs: 220,
  gapMs: 160,
  exitMs: 420,
  reducedExitMs: 90,
  safetyMs: 8_000
} as const;

export type StoryLoaderMode = 'cold-hero' | 'direct' | 'reduced';
export type StoryLoaderStatus = 'running' | 'exiting' | 'hidden';
export type StoryLoaderExitReason = 'ready' | 'error' | 'safety';
export type StoryLoaderPhrasePhase =
  | 'waiting'
  | 'revealing'
  | 'holding'
  | 'concealing'
  | 'gap'
  | 'complete';

export type StoryLoaderFrame = Readonly<{
  phrase: string;
  phraseIndex: number;
  phase: StoryLoaderPhrasePhase;
  sequenceComplete: boolean;
}>;

export type StoryLoaderProps = {
  mode: StoryLoaderMode;
  ready: boolean;
  failed: boolean;
  onExitStart?: (reason: StoryLoaderExitReason) => void;
  onHidden?: (reason: StoryLoaderExitReason) => void;
  onStatusChange?: (status: StoryLoaderStatus) => void;
};

const PHRASE_DURATION_MS =
  STORY_LOADER_TIMINGS.revealMs
  + STORY_LOADER_TIMINGS.holdMs
  + STORY_LOADER_TIMINGS.revealMs;

const COLD_BOUNDARIES = [
  STORY_LOADER_TIMINGS.startDelayMs,
  STORY_LOADER_TIMINGS.startDelayMs + STORY_LOADER_TIMINGS.revealMs,
  STORY_LOADER_TIMINGS.startDelayMs + STORY_LOADER_TIMINGS.revealMs + STORY_LOADER_TIMINGS.holdMs,
  STORY_LOADER_TIMINGS.startDelayMs + PHRASE_DURATION_MS,
  STORY_LOADER_TIMINGS.startDelayMs + PHRASE_DURATION_MS + STORY_LOADER_TIMINGS.gapMs,
  STORY_LOADER_TIMINGS.startDelayMs + PHRASE_DURATION_MS + STORY_LOADER_TIMINGS.gapMs + STORY_LOADER_TIMINGS.revealMs,
  STORY_LOADER_TIMINGS.startDelayMs + PHRASE_DURATION_MS + STORY_LOADER_TIMINGS.gapMs
    + STORY_LOADER_TIMINGS.revealMs + STORY_LOADER_TIMINGS.holdMs,
  STORY_LOADER_TIMINGS.startDelayMs + PHRASE_DURATION_MS * 2 + STORY_LOADER_TIMINGS.gapMs
] as const;

export function loaderSequenceDuration(mode: StoryLoaderMode): number {
  return mode === 'cold-hero' ? COLD_BOUNDARIES.at(-1) ?? 0 : 0;
}

export function loaderFrameAt(elapsedMs: number, mode: StoryLoaderMode): StoryLoaderFrame {
  if (mode !== 'cold-hero') {
    return {
      phrase: '同野观幂',
      phraseIndex: 0,
      phase: 'holding',
      sequenceComplete: true
    };
  }

  const elapsed = Math.max(0, elapsedMs);
  const [start, firstHold, firstConceal, firstGap, secondReveal, secondHold, secondConceal, complete] = COLD_BOUNDARIES;
  if (elapsed < start) {
    return { phrase: LOADER_PHRASES[0], phraseIndex: 0, phase: 'waiting', sequenceComplete: false };
  }
  if (elapsed < firstHold) {
    return { phrase: LOADER_PHRASES[0], phraseIndex: 0, phase: 'revealing', sequenceComplete: false };
  }
  if (elapsed < firstConceal) {
    return { phrase: LOADER_PHRASES[0], phraseIndex: 0, phase: 'holding', sequenceComplete: false };
  }
  if (elapsed < firstGap) {
    return { phrase: LOADER_PHRASES[0], phraseIndex: 0, phase: 'concealing', sequenceComplete: false };
  }
  if (elapsed < secondReveal) {
    return { phrase: LOADER_PHRASES[0], phraseIndex: 0, phase: 'gap', sequenceComplete: false };
  }
  if (elapsed < secondHold) {
    return { phrase: LOADER_PHRASES[1], phraseIndex: 1, phase: 'revealing', sequenceComplete: false };
  }
  if (elapsed < secondConceal) {
    return { phrase: LOADER_PHRASES[1], phraseIndex: 1, phase: 'holding', sequenceComplete: false };
  }
  if (elapsed < complete) {
    return { phrase: LOADER_PHRASES[1], phraseIndex: 1, phase: 'concealing', sequenceComplete: false };
  }
  return { phrase: LOADER_PHRASES[1], phraseIndex: 1, phase: 'complete', sequenceComplete: true };
}

export function StoryLoader({
  mode,
  ready,
  failed,
  onExitStart,
  onHidden,
  onStatusChange
}: StoryLoaderProps) {
  const [frame, setFrame] = useState<StoryLoaderFrame>(() => loaderFrameAt(0, mode));
  const [exitReason, setExitReason] = useState<StoryLoaderExitReason | undefined>(undefined);
  const [hidden, setHidden] = useState(false);
  const exitNotifiedRef = useRef(false);
  const hiddenNotifiedRef = useRef(false);
  const status: StoryLoaderStatus = hidden ? 'hidden' : exitReason ? 'exiting' : 'running';

  useLayoutEffect(() => {
    document.getElementById('story-loader-static')?.remove();
  }, []);

  useEffect(() => {
    setFrame(loaderFrameAt(0, mode));
    if (mode !== 'cold-hero') {
      return;
    }
    const timers = COLD_BOUNDARIES.map((boundary) => window.setTimeout(() => {
      setFrame(loaderFrameAt(boundary, mode));
    }, boundary));
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [mode]);

  useEffect(() => {
    if (failed) {
      setExitReason((current) => current ?? 'error');
      return;
    }
    if (ready && frame.sequenceComplete) {
      setExitReason((current) => current ?? 'ready');
    }
  }, [failed, frame.sequenceComplete, ready]);

  useEffect(() => {
    if (exitReason || hidden) {
      return;
    }
    const timer = window.setTimeout(() => setExitReason('safety'), STORY_LOADER_TIMINGS.safetyMs);
    return () => window.clearTimeout(timer);
  }, [exitReason, hidden]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    if (!exitReason || hidden) {
      return;
    }
    if (!exitNotifiedRef.current) {
      exitNotifiedRef.current = true;
      onExitStart?.(exitReason);
    }
    const exitMs = mode === 'reduced'
      ? STORY_LOADER_TIMINGS.reducedExitMs
      : STORY_LOADER_TIMINGS.exitMs;
    const timer = window.setTimeout(() => {
      setHidden(true);
      if (!hiddenNotifiedRef.current) {
        hiddenNotifiedRef.current = true;
        onHidden?.(exitReason);
      }
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [exitReason, hidden, mode, onExitStart, onHidden]);

  const style = useMemo(() => ({
    '--story-loader-reveal-ms': `${STORY_LOADER_TIMINGS.revealMs}ms`,
    '--story-loader-exit-ms': `${mode === 'reduced' ? STORY_LOADER_TIMINGS.reducedExitMs : STORY_LOADER_TIMINGS.exitMs}ms`
  }) as CSSProperties, [mode]);

  return (
    <div
      className="story-loader loading-screen"
      data-story-loader="true"
      data-loader-mode={mode}
      data-loader-status={status}
      data-loader-phrase={frame.phraseIndex}
      data-loader-phase={frame.phase}
      aria-hidden={hidden ? 'true' : undefined}
      inert={status !== 'running' ? true : undefined}
      hidden={hidden}
      style={style}
    >
      <div className="story-loader__word loader-word" aria-hidden="true">
        <div key={`blur-${frame.phraseIndex}`} className="story-loader__ink-blur">
          <span>{frame.phrase}</span>
        </div>
        <div key={`clear-${frame.phraseIndex}`} className="story-loader__ink-clear">
          <span>{frame.phrase}</span>
        </div>
      </div>
      <p className="story-loader__announcement r4-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {frame.phrase}
      </p>
    </div>
  );
}
