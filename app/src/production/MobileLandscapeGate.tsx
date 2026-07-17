import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  MOBILE_LANDSCAPE_GATE_ENABLED,
  type MobileLandscapeEntryState
} from './mobile-landscape-entry';

type MobileLandscapeSample = Readonly<{
  gatedPhone: boolean;
  landscapeCurrentlyAllowed: boolean;
  width: number;
  height: number;
}>;

export type MobileLandscapeEntry = Readonly<{
  state: MobileLandscapeEntryState;
  started: boolean;
  landscapeCurrentlyAllowed: boolean;
  start(): void;
}>;

export type MobileLandscapeGateProps = Readonly<{
  state: MobileLandscapeEntryState;
  onStart(): void;
}>;

const MAX_PHONE_EDGE_PX = 500;
const MIN_LANDSCAPE_WIDTH_PX = 640;
const MIN_LANDSCAPE_HEIGHT_PX = 300;
const MIN_LANDSCAPE_DELTA_PX = 48;
const MAX_VIEWPORT_DRIFT_PX = 2;
const LANDSCAPE_QUIET_MS = 180;
const BYPASS = 0;
const PORTRAIT_BLOCKED = 1;
const LANDSCAPE_READY = 2;
const STARTED = 3;
const PORTRAIT_WARNING = 4;
const ENTRY_STATES = [
  'bypass',
  'portrait-blocked',
  'landscape-ready',
  'started',
  'portrait-warning'
] as const satisfies readonly MobileLandscapeEntryState[];

type MobileLandscapeEntryCode = typeof BYPASS
  | typeof PORTRAIT_BLOCKED
  | typeof LANDSCAPE_READY
  | typeof STARTED
  | typeof PORTRAIT_WARNING;

function observeMobileLandscape(): MobileLandscapeSample {
  if (typeof window === 'undefined') {
    return { gatedPhone: false, landscapeCurrentlyAllowed: true, width: 0, height: 0 };
  }
  const viewport = window.visualViewport;
  const width = Math.max(0, viewport?.width ?? window.innerWidth);
  const height = Math.max(0, viewport?.height ?? window.innerHeight);
  const gatedPhone = MOBILE_LANDSCAPE_GATE_ENABLED
    && window.matchMedia('(pointer: coarse)').matches
    && window.matchMedia('(hover: none)').matches
    && Math.min(width, height) <= MAX_PHONE_EDGE_PX;
  return {
    gatedPhone,
    landscapeCurrentlyAllowed: !gatedPhone || (
      width >= MIN_LANDSCAPE_WIDTH_PX
      && height >= MIN_LANDSCAPE_HEIGHT_PX
      && width - height >= MIN_LANDSCAPE_DELTA_PX
    ),
    width,
    height
  };
}

function entryState(
  sample: MobileLandscapeSample,
  started: boolean,
  stable: boolean
): MobileLandscapeEntryCode {
  if (!sample.gatedPhone) {
    return BYPASS;
  }
  if (started) {
    return sample.landscapeCurrentlyAllowed ? STARTED : PORTRAIT_WARNING;
  }
  return stable ? LANDSCAPE_READY : PORTRAIT_BLOCKED;
}

function sameViewport(first: MobileLandscapeSample, second: MobileLandscapeSample): boolean {
  return Math.abs(first.width - second.width) <= MAX_VIEWPORT_DRIFT_PX
    && Math.abs(first.height - second.height) <= MAX_VIEWPORT_DRIFT_PX;
}

export function useMobileLandscapeEntry(): MobileLandscapeEntry {
  const startedRef = useRef(false);
  const [stateCode, setStateCode] = useState(() => entryState(observeMobileLandscape(), false, false));

  useLayoutEffect(() => {
    document.getElementById('mobile-landscape-entry-static')?.remove();
  }, []);

  useEffect(() => {
    let firstFrame: number | undefined;
    let secondFrame: number | undefined;
    let quietTimer: number | undefined;
    let active = true;

    const cancelPending = () => {
      if (firstFrame !== undefined) {
        window.cancelAnimationFrame(firstFrame);
      }
      if (secondFrame !== undefined) {
        window.cancelAnimationFrame(secondFrame);
      }
      if (quietTimer !== undefined) {
        window.clearTimeout(quietTimer);
      }
      firstFrame = undefined;
      secondFrame = undefined;
      quietTimer = undefined;
    };

    const publish = (sample: MobileLandscapeSample, stable = false) => {
      const next = entryState(sample, startedRef.current, stable);
      setStateCode(next);
      return next;
    };

    const beginStabilityCheck = () => {
      cancelPending();
      const initial = observeMobileLandscape();
      const current = publish(initial);
      if (
        !initial.gatedPhone
        || !initial.landscapeCurrentlyAllowed
        || current === STARTED
        || current === PORTRAIT_WARNING
      ) {
        return;
      }
      firstFrame = window.requestAnimationFrame(() => {
        const first = observeMobileLandscape();
        if (!active || !first.gatedPhone || !first.landscapeCurrentlyAllowed) {
          publish(first);
          return;
        }
        secondFrame = window.requestAnimationFrame(() => {
          const second = observeMobileLandscape();
          if (
            !active
            || !second.gatedPhone
            || !second.landscapeCurrentlyAllowed
            || !sameViewport(first, second)
          ) {
            publish(second);
            return;
          }
          quietTimer = window.setTimeout(() => {
            const settled = observeMobileLandscape();
            publish(
              settled,
              active
                && settled.gatedPhone
                && settled.landscapeCurrentlyAllowed
                && sameViewport(first, settled)
            );
          }, LANDSCAPE_QUIET_MS);
        });
      });
    };

    beginStabilityCheck();
    window.addEventListener('resize', beginStabilityCheck);
    window.addEventListener('orientationchange', beginStabilityCheck);
    window.visualViewport?.addEventListener('resize', beginStabilityCheck);
    return () => {
      active = false;
      cancelPending();
      window.removeEventListener('resize', beginStabilityCheck);
      window.removeEventListener('orientationchange', beginStabilityCheck);
      window.visualViewport?.removeEventListener('resize', beginStabilityCheck);
    };
  }, []);

  const start = useCallback(() => {
    if (stateCode === LANDSCAPE_READY) {
      startedRef.current = true;
      setStateCode(entryState(observeMobileLandscape(), true, true));
    }
  }, [stateCode]);

  const state = ENTRY_STATES[stateCode];

  return {
    state,
    started: stateCode === BYPASS || startedRef.current,
    landscapeCurrentlyAllowed: stateCode === BYPASS
      || stateCode === LANDSCAPE_READY
      || stateCode === STARTED,
    start
  };
}

export function MobileLandscapeGate({ state, onStart }: MobileLandscapeGateProps) {
  if (state === 'bypass' || state === 'started') {
    return null;
  }

  const ready = state === 'landscape-ready';
  const warning = state === 'portrait-warning';
  return (
    <section
      className="mobile-landscape-gate"
      data-mobile-landscape-gate="true"
      data-mobile-landscape-state={state}
      role={warning ? 'status' : 'dialog'}
      aria-modal={warning ? undefined : true}
      aria-live={warning ? 'polite' : undefined}
      aria-label={warning ? '请转回横屏' : '横屏浏览提示'}
    >
      <div className="mobile-landscape-gate__content">
        <p className="mobile-landscape-gate__eyebrow">同野观幂</p>
        <h1>{warning ? '请转回横屏' : '请横屏浏览'}</h1>
        <p>{warning
          ? '当前阅读位置会保留，转回横屏后可继续浏览。'
          : ready
            ? '画面已准备就绪。'
            : '横屏后，等待画面稳定即可开始。'}</p>
        {ready ? (
          <button type="button" onClick={onStart}>开始浏览</button>
        ) : null}
      </div>
    </section>
  );
}
