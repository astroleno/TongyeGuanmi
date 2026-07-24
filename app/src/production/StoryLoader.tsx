import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  loaderInkSequenceDuration,
  sampleLoaderInkSequence,
  type LoaderInkPhase
} from './loader-ink-sequence';
import type { LoaderInkStatus as LoaderInkCanvasStatus } from './loader-ink-reveal';

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
export type StoryLoaderPhrasePhase = LoaderInkPhase;

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
  release?: boolean;
  startedAt?: number | undefined;
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
  return mode === 'cold-hero'
    ? loaderInkSequenceDuration(LOADER_PHRASES, STORY_LOADER_TIMINGS)
    : 0;
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

  const sample = sampleLoaderInkSequence(elapsedMs, LOADER_PHRASES, STORY_LOADER_TIMINGS);
  return {
    phrase: sample.phrase,
    phraseIndex: sample.phraseIndex,
    phase: sample.phase,
    sequenceComplete: sample.sequenceComplete
  };
}

export function StoryLoader({
  mode,
  ready,
  failed,
  release = true,
  startedAt,
  onExitStart,
  onHidden,
  onStatusChange
}: StoryLoaderProps) {
  const [frame, setFrame] = useState<StoryLoaderFrame>(() => loaderFrameAt(
    startedAt === undefined ? 0 : Math.max(0, performance.now() - startedAt),
    mode
  ));
  const [inkStatus, setInkStatus] = useState<LoaderInkCanvasStatus>(
    mode === 'cold-hero' ? 'idle' : 'fallback'
  );
  const [sequenceReady, setSequenceReady] = useState(
    mode !== 'cold-hero' || startedAt !== undefined
  );
  const [exitReason, setExitReason] = useState<StoryLoaderExitReason | undefined>(undefined);
  const [hidden, setHidden] = useState(false);
  const wordRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sequenceStartedAtRef = useRef(0);
  const exitNotifiedRef = useRef(false);
  const hiddenNotifiedRef = useRef(false);
  const status: StoryLoaderStatus = hidden ? 'hidden' : exitReason ? 'exiting' : 'running';

  useLayoutEffect(() => {
    document.getElementById('story-loader-static')?.remove();
  }, []);

  useEffect(() => {
    if (hidden) {
      return;
    }
    if (mode === 'cold-hero' && !sequenceReady) {
      setFrame(loaderFrameAt(0, mode));
      return;
    }
    const sequenceStartedAt = startedAt ?? performance.now();
    const elapsed = Math.max(0, performance.now() - sequenceStartedAt);
    sequenceStartedAtRef.current = sequenceStartedAt;
    setFrame(loaderFrameAt(elapsed, mode));
    if (mode !== 'cold-hero') {
      return;
    }
    const timers = COLD_BOUNDARIES
      .filter((boundary) => boundary > elapsed)
      .map((boundary) => window.setTimeout(() => {
        setFrame(loaderFrameAt(boundary, mode));
      }, boundary - elapsed));
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [hidden, mode, sequenceReady, startedAt]);

  useEffect(() => {
    if (mode !== 'cold-hero') {
      setInkStatus('fallback');
      setSequenceReady(true);
      return;
    }
    if (hidden) {
      return;
    }
    const canvas = canvasRef.current;
    const host = wordRef.current;
    if (!canvas || !host) {
      setInkStatus('fallback');
      return;
    }

    let current = true;
    let controller: { dispose(): void } | null = null;
    setInkStatus('idle');
    const authoredStartedAt = startedAt === undefined
      ? undefined
      : sequenceStartedAtRef.current || startedAt;
    void import('./loader-ink-reveal').then(({ createLoaderInkReveal }) => {
      if (!current) return;
      const nextController = createLoaderInkReveal({
        canvas,
        host,
        phrases: LOADER_PHRASES,
        timings: STORY_LOADER_TIMINGS,
        ...(authoredStartedAt === undefined
          ? {}
          : { startedAt: authoredStartedAt }),
        onStatusChange: (nextStatus) => {
          if (!current) {
            return;
          }
          setInkStatus(nextStatus);
          if (nextStatus === 'active' || nextStatus === 'fallback') {
            setSequenceReady(true);
          }
        }
      });
      controller = nextController;
      return nextController.start();
    }).catch(() => {
      if (current) {
        setInkStatus('fallback');
        setSequenceReady(true);
      }
    });
    return () => {
      current = false;
      controller?.dispose();
    };
  }, [hidden, mode, startedAt]);

  useEffect(() => {
    if (!release) {
      return;
    }
    if (failed) {
      setExitReason((current) => current ?? 'error');
      return;
    }
    if (ready && frame.sequenceComplete) {
      setExitReason((current) => current ?? 'ready');
    }
  }, [failed, frame.sequenceComplete, ready, release]);

  useEffect(() => {
    if (!release || exitReason || hidden) {
      return;
    }
    const timer = window.setTimeout(() => setExitReason('safety'), STORY_LOADER_TIMINGS.safetyMs);
    return () => window.clearTimeout(timer);
  }, [exitReason, hidden, release]);

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
  const holdCompleted = !release && frame.sequenceComplete;
  const clockFallbackVisible = startedAt !== undefined
    && frame.phase === 'revealing'
    && (inkStatus === 'idle' || inkStatus === 'waiting-font');

  return (
    <div
      className={`story-loader loading-screen${
        clockFallbackVisible ? ' story-loader--clock-fallback' : ''
      }`}
      data-story-loader="true"
      data-loader-mode={mode}
      data-loader-status={status}
      data-loader-ink-status={inkStatus}
      data-loader-phrase={frame.phraseIndex}
      data-loader-phase={frame.phase}
      data-loader-release={release ? 'auto' : 'blocked'}
      aria-hidden={hidden ? 'true' : undefined}
      inert={status !== 'running' ? true : undefined}
      hidden={hidden}
      style={style}
    >
      <div ref={wordRef} className="story-loader__word loader-word" aria-hidden="true">
        <canvas
          ref={canvasRef}
          className="story-loader__ink-canvas"
          data-loader-ink-canvas="true"
          aria-hidden="true"
          style={holdCompleted ? { opacity: 0, visibility: 'hidden' } : undefined}
        />
        <div key={`blur-${frame.phraseIndex}`} className="story-loader__ink-blur">
          <span>{frame.phrase}</span>
        </div>
        <div
          key={`clear-${frame.phraseIndex}`}
          className="story-loader__ink-clear"
          style={holdCompleted ? { opacity: 1, visibility: 'visible' } : undefined}
        >
          <span style={holdCompleted ? { opacity: 1, clipPath: 'inset(0)' } : undefined}>
            {frame.phrase}
          </span>
        </div>
      </div>
      <p className="story-loader__announcement r4-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {frame.phrase}
      </p>
    </div>
  );
}
