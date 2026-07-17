export type MobileLandscapeViewport = Readonly<{
  width: number;
  height: number;
}>;

export type MobileLandscapeCapabilities = Readonly<{
  pointerCoarse: boolean;
  hoverNone: boolean;
}>;

export type MobileLandscapeEntryState =
  | 'bypass'
  | 'portrait-blocked'
  | 'landscape-ready'
  | 'started'
  | 'portrait-warning';

export type MobileLandscapeEntryInput = Readonly<{
  gatedPhone: boolean;
  landscapeStable: boolean;
  landscapeCurrentlyAllowed: boolean;
  started: boolean;
}>;

export const MOBILE_LANDSCAPE_MAX_EDGE_PX = 500;
export const MOBILE_LANDSCAPE_MIN_WIDTH_PX = 640;
export const MOBILE_LANDSCAPE_MIN_HEIGHT_PX = 300;
export const MOBILE_LANDSCAPE_MIN_WIDTH_DELTA_PX = 48;
export const MOBILE_LANDSCAPE_MAX_DRIFT_PX = 2;
export const MOBILE_LANDSCAPE_QUIET_MS = 180;
export const MOBILE_LANDSCAPE_GATE_ENABLED = false;

type ViewportWindow = Pick<Window, 'innerHeight' | 'innerWidth' | 'visualViewport'>;
type MediaWindow = Pick<Window, 'matchMedia'>;

function dimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function mobileLandscapeViewport(
  target: Pick<ViewportWindow, 'innerHeight' | 'innerWidth'> & {
    visualViewport?: Pick<VisualViewport, 'height' | 'width'> | null;
  }
): MobileLandscapeViewport {
  const viewport = target.visualViewport;
  return {
    width: dimension(viewport?.width ?? target.innerWidth),
    height: dimension(viewport?.height ?? target.innerHeight)
  };
}

export function mobileLandscapeCapabilities(target: MediaWindow): MobileLandscapeCapabilities {
  return {
    pointerCoarse: target.matchMedia('(pointer: coarse)').matches,
    hoverNone: target.matchMedia('(hover: none)').matches
  };
}

export function isGatedPhone(
  viewport: MobileLandscapeViewport,
  capabilities: MobileLandscapeCapabilities
): boolean {
  return capabilities.pointerCoarse
    && capabilities.hoverNone
    && Math.min(viewport.width, viewport.height) <= MOBILE_LANDSCAPE_MAX_EDGE_PX;
}

export function isPhoneLandscapeReady(viewport: MobileLandscapeViewport): boolean {
  return viewport.width >= MOBILE_LANDSCAPE_MIN_WIDTH_PX
    && viewport.height >= MOBILE_LANDSCAPE_MIN_HEIGHT_PX
    && viewport.width - viewport.height >= MOBILE_LANDSCAPE_MIN_WIDTH_DELTA_PX;
}

export function isViewportDriftWithin(
  first: MobileLandscapeViewport,
  second: MobileLandscapeViewport,
  maxDriftPx = MOBILE_LANDSCAPE_MAX_DRIFT_PX
): boolean {
  return Math.abs(first.width - second.width) <= maxDriftPx
    && Math.abs(first.height - second.height) <= maxDriftPx;
}

export type MobileLandscapeStability = Readonly<{
  stable: boolean;
  quietUntil: number | undefined;
}>;

export function createMobileLandscapeStabilityTracker(
  quietMs = MOBILE_LANDSCAPE_QUIET_MS
) {
  let firstLandscapeFrame: MobileLandscapeViewport | undefined;
  let quietUntil: number | undefined;

  const reset = () => {
    firstLandscapeFrame = undefined;
    quietUntil = undefined;
  };

  return {
    reset,
    sample(viewport: MobileLandscapeViewport, now: number): MobileLandscapeStability {
      if (!isPhoneLandscapeReady(viewport)) {
        reset();
        return { stable: false, quietUntil: undefined };
      }
      if (!firstLandscapeFrame) {
        firstLandscapeFrame = viewport;
        return { stable: false, quietUntil: undefined };
      }
      if (!isViewportDriftWithin(firstLandscapeFrame, viewport)) {
        firstLandscapeFrame = viewport;
        quietUntil = undefined;
        return { stable: false, quietUntil: undefined };
      }
      quietUntil ??= now + quietMs;
      return { stable: now >= quietUntil, quietUntil };
    }
  };
}

export function mobileLandscapeEntryState({
  gatedPhone,
  landscapeStable,
  landscapeCurrentlyAllowed,
  started
}: MobileLandscapeEntryInput): MobileLandscapeEntryState {
  if (!gatedPhone) {
    return 'bypass';
  }
  if (started) {
    return landscapeCurrentlyAllowed ? 'started' : 'portrait-warning';
  }
  return landscapeStable ? 'landscape-ready' : 'portrait-blocked';
}
