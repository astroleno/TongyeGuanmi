const EPSILON = 0.001;

/**
 * PH and Crane are autonomous visual runs. The native document owns every
 * pixel outside a run; the fixed stage owns the one shared boundary while a
 * run is active.
 */
export const PHONE_LAB_CONTACT_AUTOPLAY_EVENT = 'phone-lab-contact-autoplay';

export type PhoneLabContactAutoplayEventDetail = Readonly<{
  scene: 'ph-animation' | 'crane-animation';
  phase: 'start' | 'playing' | 'progress' | 'complete' | 'failed';
  direction: 1 | -1;
  progress?: number;
}>;

export type PhoneLabContactCinematicRunState =
  | 'initial'
  | 'forward'
  | 'complete'
  | 'reverse';

export type PhoneLabContactCinematicScene =
  | 'ph-animation'
  | 'crane-animation';

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

/** A visual can replay only after the opposite traversal reaches an endpoint. */
export function phoneLabContactCanBeginVisualRun(
  phase: PhoneLabContactCinematicRunState,
  direction: 1 | -1
): boolean {
  return direction === 1 ? phase === 'initial' : phase === 'complete';
}

export function phoneLabContactPhaseAfterVisualCompletion(
  direction: 1 | -1
): PhoneLabContactCinematicRunState {
  return direction === 1 ? 'complete' : 'initial';
}

/** Mirror d208a86 Figure3 retention until Crane needs Unit 6's media slot. */
export function phoneLabContactRetainsPhTerminal(
  phase: PhoneLabContactCinematicRunState,
  craneNeedsMedia = false
): boolean {
  return phase === 'complete' && !craneNeedsMedia;
}

/** Contact keeps Crane's verified terminal compositor ready for reverse. */
export function phoneLabContactRetainsCraneTerminal(
  phase: PhoneLabContactCinematicRunState
): boolean {
  return phase === 'complete';
}

/**
 * Both directions use the marker's one document top. The marker overlaps the
 * following Education/Contact receiver, exactly like Unit 5's visual tracks.
 */
export function phoneLabContactVisualBoundaryY(
  scrollY: number,
  trackTop: number
): number {
  return Math.max(0, scrollY + trackTop);
}

/**
 * Safari may clamp the final shared edge to the maximum document scroll with
 * a sub-pixel remainder. Treat the sampled edge pixel as the receiver side so
 * Contact can own the exact Crane boundary without manufacturing extra space.
 */
export function phoneLabContactAtOrPastVisualBoundary(
  scrollY: number,
  boundaryY: number,
  tolerance = 1
): boolean {
  return scrollY >= boundaryY - Math.max(0, tolerance);
}

/** A forward pan may jump past the exact shared edge in one Safari sample. */
export function phoneLabContactCrossedVisualStart(
  previousScrollY: number,
  scrollY: number,
  trackTop: number
): boolean {
  const boundaryY = phoneLabContactVisualBoundaryY(scrollY, trackTop);
  return previousScrollY < boundaryY && scrollY >= boundaryY;
}

/** Reverse autoplay begins at the same semantic edge used by forward. */
export function phoneLabContactCrossedVisualBoundary(
  previousScrollY: number,
  scrollY: number,
  trackTop: number
): boolean {
  if (scrollY >= previousScrollY - 0.5) return false;
  const boundaryY = phoneLabContactVisualBoundaryY(scrollY, trackTop);
  const crossed = previousScrollY >= boundaryY - 1
    && scrollY < boundaryY - 1;
  const approaching = previousScrollY > boundaryY + 1
    && scrollY <= boundaryY + 32;
  return crossed || approaching;
}

/** Legacy standalone Unit 6 shell helper; Unit 7B landing is centralized in
 * `resolvePhoneRunLanding` and no longer calls this function. */
export function phoneLabContactVisualRunAnchor(
  scrollY: number,
  boundaryY: number,
  direction: 1 | -1
): number {
  return direction === -1
    ? Math.min(scrollY, boundaryY)
    : boundaryY;
}

/** Safari can settle exactly on an edge without emitting a -1px scroll. */
export function phoneLabContactCanArmReverseGesture(
  phase: PhoneLabContactCinematicRunState,
  scrollY: number,
  boundaryY: number,
  tolerance = 32
): boolean {
  return phase === 'complete'
    && Math.abs(scrollY - boundaryY) <= Math.max(0, tolerance);
}

/** A downward finger drag expresses native intent to move back up. */
export function phoneLabContactHasReverseGestureIntent(
  startY: number,
  currentY: number,
  threshold = 10
): boolean {
  return currentY - startY >= Math.max(1, threshold);
}

/**
 * Hold an upstream transition at its visual endpoint while native time owns
 * the stage. This prevents an overshot scroll sample from revealing the
 * previous article beneath a forward or reverse media run.
 */
export function phoneLabContactCommittedBoundaryProgress(
  rawProgress: number,
  visualHeld: boolean
): number {
  return visualHeld ? 1 : clamp(rawProgress);
}

/** A short bounded transition as the next visual marker enters the viewport. */
export function phoneLabContactApproachProgress(
  elementTop: number,
  viewportHeight: number
): number {
  const height = Math.max(1, viewportHeight);
  return clamp((height - elementTop) / height);
}

/**
 * Lab → PH uses Unit 4–5's reviewed lower-85% ink ownership window.
 */
export function phoneLabContactInkBoundaryProgress(
  elementTop: number,
  viewportHeight: number
): number {
  const start = Math.max(1, viewportHeight) * 0.85;
  return clamp((start - elementTop) / Math.max(EPSILON, start));
}
