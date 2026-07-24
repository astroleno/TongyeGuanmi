export type PhonePanPoint = Readonly<{
  x: number;
  y: number;
}>;

export type PhonePanDirection = 'horizontal' | 'vertical' | undefined;

const PHONE_PAN_DIRECTION_SLOP_PX = 8;

/** Decide one axis after a small slop so vertical reading never gets cancelled. */
export function phonePanDirection(
  start: PhonePanPoint,
  current: PhonePanPoint,
  slopPx = PHONE_PAN_DIRECTION_SLOP_PX
): PhonePanDirection {
  const horizontalDistance = Math.abs(current.x - start.x);
  const verticalDistance = Math.abs(current.y - start.y);
  if (Math.max(horizontalDistance, verticalDistance) < slopPx) return undefined;
  return horizontalDistance > verticalDistance ? 'horizontal' : 'vertical';
}

function touchForIdentifier(touches: TouchList, identifier: number): Touch | undefined {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches.item(index);
    if (touch?.identifier === identifier) return touch;
  }
  return undefined;
}

/**
 * Safari can rubber-band fixed-stage pages sideways despite `touch-action:
 * pan-y`. This local, non-passive fallback blocks only a decisively horizontal
 * single-touch pan; document scrolling, controls, and pinch zoom stay native.
 */
export function attachPhoneHorizontalPanGuard(root: HTMLElement): () => void {
  let touchIdentifier: number | undefined;
  let start: PhonePanPoint | undefined;
  let direction: PhonePanDirection;

  const reset = () => {
    touchIdentifier = undefined;
    start = undefined;
    direction = undefined;
  };
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      reset();
      return;
    }
    const touch = event.touches.item(0);
    if (!touch) return;
    touchIdentifier = touch.identifier;
    start = { x: touch.clientX, y: touch.clientY };
    direction = undefined;
  };
  const onTouchMove = (event: TouchEvent) => {
    if (touchIdentifier === undefined || !start || event.touches.length !== 1) return;
    const touch = touchForIdentifier(event.touches, touchIdentifier);
    if (!touch) return;
    direction ??= phonePanDirection(start, { x: touch.clientX, y: touch.clientY });
    if (direction === 'horizontal' && event.cancelable) event.preventDefault();
  };

  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('touchend', reset, { passive: true });
  root.addEventListener('touchcancel', reset, { passive: true });
  if (import.meta.env.DEV) {
    root.dataset.phoneHorizontalPanGuard = 'active';
  }

  return () => {
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', reset);
    root.removeEventListener('touchcancel', reset);
    if (import.meta.env.DEV) {
      delete root.dataset.phoneHorizontalPanGuard;
    }
  };
}
