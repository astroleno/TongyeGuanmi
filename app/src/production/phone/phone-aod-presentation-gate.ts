import type { PhoneAodStartResult } from './aod-autoplay';
import type { PhoneExecutionToken } from './phone-story-state';

export const PHONE_AOD_PREPARE_TIMEOUT_MS = 6_000;
export const PHONE_AOD_PROGRESS_WATCHDOG_MS = 2_400;

export type PhoneAodPresentationGateSession = Readonly<{
  identity: PhoneExecutionToken;
  valid(): boolean;
  reportFrame(): void;
  reportEvidence(): void;
  reportProgress(progress: number): void;
  complete(): void;
  fail(): void;
}>;

type TimerApi = Readonly<{
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}>;

export type PhoneAodPresentationGate = Readonly<{
  start(session: PhoneAodPresentationGateSession): boolean;
  retryFromGesture(): boolean;
  observeMediaProgress(progress: number, direction: 1 | -1, identity: PhoneExecutionToken): void;
  reportCompositorFrame(progress: number, direction: 1 | -1, identity: PhoneExecutionToken): void;
  complete(direction: 1 | -1, identity: PhoneExecutionToken): void;
  reset(): void;
}>;

function sameToken(
  left: PhoneExecutionToken,
  right: PhoneExecutionToken
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function advances(
  prior: number | null,
  next: number,
  direction: 1 | -1
): boolean {
  if (prior === null) return true;
  return direction === 1 ? next > prior + .0001 : next < prior - .0001;
}

function terminal(progress: number, direction: 1 | -1): boolean {
  return direction === 1 ? progress >= .999 : progress <= .001;
}

/**
 * Couples a reducer-owned AOD execution to actual packed-canvas frames.
 * Decoder liveness is retained for diagnostics only: only a compositor draw
 * starts or advances the transaction watchdog.
 */
export function createPhoneAodPresentationGate({
  startAutoplay,
  onReset,
  timers = globalThis
}: Readonly<{
  startAutoplay(
    direction: 1 | -1,
    identity: PhoneExecutionToken
  ): Promise<PhoneAodStartResult>;
  onReset(): void;
  timers?: TimerApi;
}>): PhoneAodPresentationGate {
  let active: PhoneAodPresentationGateSession | null = null;
  let blocked = false;
  let starting = false;
  let presented = false;
  let compositorProgress: number | null = null;
  let prepareTimer: ReturnType<typeof setTimeout> | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    if (prepareTimer !== undefined) timers.clearTimeout(prepareTimer);
    if (progressTimer !== undefined) timers.clearTimeout(progressTimer);
    prepareTimer = undefined;
    progressTimer = undefined;
  };
  const reset = () => {
    clearTimers();
    active = null;
    blocked = false;
    starting = false;
    presented = false;
    compositorProgress = null;
  };
  const owns = (identity: PhoneExecutionToken) => (
    Boolean(active && active.valid() && sameToken(active.identity, identity))
  );
  const fail = () => {
    const session = active;
    if (!session || !session.valid()) {
      reset();
      return;
    }
    reset();
    onReset();
    session.fail();
  };
  const armPrepare = () => {
    if (prepareTimer !== undefined) timers.clearTimeout(prepareTimer);
    prepareTimer = timers.setTimeout(() => {
      prepareTimer = undefined;
      if (!presented) fail();
    }, PHONE_AOD_PREPARE_TIMEOUT_MS);
  };
  const armProgress = () => {
    if (!presented) return;
    if (progressTimer !== undefined) timers.clearTimeout(progressTimer);
    progressTimer = timers.setTimeout(() => {
      progressTimer = undefined;
      fail();
    }, PHONE_AOD_PROGRESS_WATCHDOG_MS);
  };
  const attempt = () => {
    const session = active;
    if (!session || !session.valid() || starting) return false;
    starting = true;
    blocked = false;
    void startAutoplay(session.identity[4], session.identity).then(
      (result) => {
        if (!active || active !== session || !session.valid()) return;
        starting = false;
        if (result === 'playing') return;
        if (result === 'blocked') {
          // The authority keeps the same preparing transaction until a real
          // gesture retries it or the independent prepare deadline expires.
          blocked = true;
          return;
        }
        fail();
      },
      () => {
        if (active === session && session.valid()) {
          starting = false;
          fail();
        }
      }
    );
    return true;
  };

  return {
    start(session) {
      reset();
      active = session;
      armPrepare();
      return attempt();
    },
    retryFromGesture() {
      if (!active || !blocked || !active.valid()) return false;
      return attempt();
    },
    observeMediaProgress(_progress, _direction, identity) {
      // Media time is decoder liveness, not presentation. We accept the
      // matching callback for identity diagnostics but never reset a timer.
      if (!owns(identity)) return;
    },
    reportCompositorFrame(rawProgress, direction, identity) {
      if (!owns(identity)) return;
      const progress = clamp(rawProgress);
      if (!presented) {
        presented = true;
        blocked = false;
        if (prepareTimer !== undefined) timers.clearTimeout(prepareTimer);
        prepareTimer = undefined;
        active?.reportEvidence();
        if (!active?.valid()) return;
        active.reportFrame();
      }
      if (!active?.valid() || !advances(compositorProgress, progress, direction)) {
        return;
      }
      compositorProgress = progress;
      active.reportProgress(progress);
      armProgress();
    },
    complete(direction, identity) {
      const session = active;
      if (
        !session
        || !owns(identity)
        || !presented
        || !terminal(compositorProgress ?? (direction === 1 ? 0 : 1), direction)
      ) return;
      reset();
      session.complete();
    },
    reset
  };
}
