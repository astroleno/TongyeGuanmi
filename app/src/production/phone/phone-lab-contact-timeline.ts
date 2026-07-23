const EPSILON = 0.001;
const MOTION_LANE_EPSILON = 0.005;

export const PHONE_LAB_CONTACT_STOPS = Object.freeze({
  // Enter the native media lane as soon as the sticky camera reaches the
  // viewport, then keep the snap at the far edge of the lane. This mirrors
  // the accepted AOD route: one gesture chooses the scene, native time owns
  // playback, and the next gesture can reveal the following document beat
  // without traversing a second invisible hold.
  handoffEnd: 0.01,
  sceneMotionEnd: 0.99,
  endpoint: 1
});

/**
 * PH and Crane own native media time after a document threshold is crossed.
 * The acceptance shell listens for these local events to keep the document
 * snapped at that threshold without extending the shared PhoneStoryShell API.
 */
export const PHONE_LAB_CONTACT_AUTOPLAY_EVENT = 'phone-lab-contact-autoplay';

export type PhoneLabContactAutoplayEventDetail = Readonly<{
  scene: 'ph-animation' | 'crane-animation';
  phase: 'start' | 'playing' | 'progress' | 'complete';
  direction: 1 | -1;
  progress?: number;
}>;

export type PhoneLabContactCinematicRunState =
  | 'idle'
  | 'forward'
  | 'handoff'
  | 'complete'
  | 'reverse';

export type PhoneLabContactCinematicScene =
  | 'ph-animation'
  | 'crane-animation';

/** Snap only after the native clock has produced real playback evidence. */
export function phoneLabContactAutoplayLocksSnap(
  detail: PhoneLabContactAutoplayEventDetail
): boolean {
  return detail.phase === 'playing';
}

export function dispatchPhoneLabContactAutoplay(
  target: EventTarget | null | undefined,
  detail: PhoneLabContactAutoplayEventDetail
): void {
  if (!target || typeof CustomEvent === 'undefined') return;
  target.dispatchEvent(new CustomEvent<PhoneLabContactAutoplayEventDetail>(
    PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
    { bubbles: true, detail }
  ));
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range01(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(EPSILON, end - start));
}

function reducedEndpoint(value: number, reducedMotion: boolean): number {
  const progress = clamp(value);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

export type PhoneLabContactPhaseFrame = Readonly<{
  progress: number;
  handoffProgress: number;
  sceneProgress: number;
  arrivalProgress: number;
  stageActive: boolean;
}>;

/**
 * Keep native playback alive after the snap rounds into the tiny exit lane.
 * Physical scroll positions are integer pixels, so a 99% anchor on a short
 * phone rail can sample fractionally past `sceneMotionEnd`. Without the lock
 * override the adapter receives `leave()` immediately after `enter()` and the
 * first decoded frame appears frozen.
 */
export function phoneLabContactOwnsNativePlayback(
  frame: PhoneLabContactPhaseFrame,
  snapLocked: boolean
): boolean {
  const reachedMotionLane = frame.handoffProgress >= 1 - MOTION_LANE_EPSILON;
  const remainsInMotionLane = frame.arrivalProgress <= MOTION_LANE_EPSILON;
  return reachedMotionLane
    && (remainsInMotionLane || snapLocked)
    && (frame.stageActive || snapLocked);
}

/**
 * Maps a pinned cinematic chapter to stable endpoints plus a single authored
 * scene run. The same geometry drives Lab → PH and Education → Crane.
 */
export function phoneLabContactPhaseFrame(
  rawProgress: number,
  reducedMotion = false
): PhoneLabContactPhaseFrame {
  const progress = reducedEndpoint(rawProgress, reducedMotion);
  const { handoffEnd, sceneMotionEnd, endpoint } = PHONE_LAB_CONTACT_STOPS;
  return {
    progress,
    handoffProgress: range01(progress, 0, handoffEnd),
    sceneProgress: range01(progress, handoffEnd, sceneMotionEnd),
    arrivalProgress: range01(progress, sceneMotionEnd, endpoint),
    stageActive: progress < endpoint - EPSILON
  };
}

/** Maps an element's native document distance to its pinned-stage progress. */
export function phoneLabContactScrollProgress(
  elementTop: number,
  elementHeight: number,
  viewportHeight: number
): number {
  const distance = Math.max(1, elementHeight - viewportHeight);
  return clamp(-elementTop / distance);
}

/**
 * Drives the real incoming document viewport, before a pinned cinematic rail
 * reaches its autoplay boundary. This is where Lab → PH and Education → Crane
 * own their endpoint dissolve; media ownership begins only at progress 1.
 */
export function phoneLabContactApproachProgress(
  elementTop: number,
  viewportHeight: number
): number {
  const height = Math.max(1, viewportHeight);
  return clamp((height - elementTop) / height);
}

/**
 * Match d208a86's reviewed Unit 4–5 ink boundary. The native reading scene
 * remains the document owner until the receiver enters the lower 85% of the
 * viewport; the shared field then reaches its endpoint exactly at the fixed
 * stage boundary.
 */
export function phoneLabContactInkBoundaryProgress(
  elementTop: number,
  viewportHeight: number
): number {
  const start = Math.max(1, viewportHeight) * 0.85;
  return clamp((start - elementTop) / start);
}

/** Stable document coordinate shared by scroll crossing and touch reverse. */
export function phoneLabContactReverseBoundaryY(
  phaseTop: number,
  phaseDistance: number
): number {
  return phaseTop
    + Math.max(1, phaseDistance) * PHONE_LAB_CONTACT_STOPS.sceneMotionEnd;
}

/**
 * Safari can settle exactly on the released cinematic edge without emitting
 * the otherwise-required negative scroll delta. Arm the next touch there,
 * using the same 32px tolerance as the accepted Unit 4–5 coordinator.
 */
export function phoneLabContactCanArmReverseGesture(
  runState: PhoneLabContactCinematicRunState,
  scrollY: number,
  boundaryY: number,
  tolerance = 32
): boolean {
  return runState === 'complete'
    && Math.abs(scrollY - boundaryY) <= Math.max(0, tolerance);
}

/** A downward finger drag expresses the native intent to move back up. */
export function phoneLabContactHasReverseGestureIntent(
  startY: number,
  currentY: number,
  threshold = 10
): boolean {
  return currentY - startY >= Math.max(1, threshold);
}

/**
 * Preserve the position Safari has already presented. Pulling an overshot
 * gesture back down would replay the reading opener before reverse media owns
 * the fixed stage.
 */
export function phoneLabContactReverseRunAnchor(
  scrollY: number,
  boundaryY: number
): number {
  return Math.min(scrollY, boundaryY);
}

/**
 * Detect a physical gesture crossing the native-playback boundary even when
 * one Safari scroll sample skips the whole short trigger lane. AOD starts its
 * native clock from the timeline crossing itself; PH and Crane must do the
 * same instead of requiring the document to land inside a 1–2 px window.
 */
export function phoneLabContactCrossedAutoplayBoundary(
  previousScrollY: number,
  nextScrollY: number,
  phaseTop: number,
  phaseDistance: number,
  direction: 1 | -1
): boolean {
  // Forward playback begins when the retained camera first reaches the
  // viewport. Waiting for the 1% dissolve lane required a second swipe when
  // physical Safari landed exactly on the chapter boundary.
  const boundaryProgress = direction === 1
    ? 0
    : PHONE_LAB_CONTACT_STOPS.sceneMotionEnd;
  const boundaryY = phaseTop
    + Math.max(1, phaseDistance) * boundaryProgress;
  if (direction === 1) {
    return previousScrollY < boundaryY && nextScrollY >= boundaryY;
  }
  if (nextScrollY >= previousScrollY - 0.5) return false;
  const crossed = previousScrollY >= boundaryY - 1
    && nextScrollY < boundaryY - 1;
  // Port d208a86's pre-lock window as well as its explicit touch path. A
  // single upward pan that settles just above the shared edge must start the
  // reverse run before Safari swallows its remaining momentum.
  const approaching = previousScrollY > boundaryY + 1
    && nextScrollY <= boundaryY + 32;
  return crossed || approaching;
}

/** Starts a missed native run after Safari rounds across a released snap. */
export function phoneLabContactShouldStartCinematic(
  input: Readonly<{
    runState: PhoneLabContactCinematicRunState;
    direction: 1 | -1;
    previousScrollY: number;
    nextScrollY: number;
    phaseTop: number;
    phaseDistance: number;
    phaseProgress: number;
    phaseInRange: boolean;
  }>
): boolean {
  const expectedState = input.direction === 1 ? 'idle' : 'complete';
  if (input.runState !== expectedState) return false;
  if (phoneLabContactCrossedAutoplayBoundary(
    input.previousScrollY,
    input.nextScrollY,
    input.phaseTop,
    input.phaseDistance,
    input.direction
  )) {
    return true;
  }
  if (!input.phaseInRange) return false;

  // Safari can round the released 99% snap to the lower side of the reverse
  // boundary. The next upward sample is then already inside the lane and a
  // strict crossing test misses it, leaving Crane's last decoded frame stuck.
  return input.direction === 1
    ? input.phaseProgress > EPSILON
    : input.phaseProgress < PHONE_LAB_CONTACT_STOPS.sceneMotionEnd - EPSILON;
}
