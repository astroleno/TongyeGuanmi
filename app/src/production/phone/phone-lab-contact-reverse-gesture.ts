import {
  isPhoneLabContactInteractiveTarget
} from './phone-lab-contact-snap-lock';
import {
  phoneLabContactHasReverseGestureIntent,
  type PhoneLabContactCinematicScene
} from './phone-lab-contact-timeline';

export type PhoneLabContactReverseGesture = Readonly<{
  dispose(): void;
}>;

type PhoneLabContactReverseGestureOptions = Readonly<{
  root: HTMLElement;
  reducedMotion: boolean;
  hasActiveRun(): boolean;
  sceneAtBoundary(): PhoneLabContactCinematicScene | null;
  beginReverse(scene: PhoneLabContactCinematicScene): boolean;
}>;

type PointerGesture = Readonly<{
  pointerId: number;
  scene: PhoneLabContactCinematicScene;
  startY: number;
}>;

type TouchGesture = Readonly<{
  identifier: number;
  scene: PhoneLabContactCinematicScene;
  startY: number;
}>;

/**
 * Exact Unit 4–5 reverse-intent topology, scoped to Unit 6. Scroll crossing
 * and touch intent still converge on the shell's one cinematic run owner.
 */
export function attachPhoneLabContactReverseGesture(
  options: PhoneLabContactReverseGestureOptions
): PhoneLabContactReverseGesture {
  const { root } = options;
  let pointerGesture: PointerGesture | null = null;
  let touchGesture: TouchGesture | null = null;
  let disposed = false;

  const clearDatasetIfIdle = () => {
    if (!pointerGesture && !touchGesture) {
      delete root.dataset.phoneLabContactReverseGesture;
    }
  };

  const canArm = (event: Event) => (
    !disposed
    && !options.reducedMotion
    && !options.hasActiveRun()
    && !isPhoneLabContactInteractiveTarget(event.target)
  );

  const begin = (scene: PhoneLabContactCinematicScene) => {
    pointerGesture = null;
    touchGesture = null;
    if (options.beginReverse(scene)) {
      root.dataset.phoneLabContactReverseGesture = `${scene}:started`;
    } else {
      delete root.dataset.phoneLabContactReverseGesture;
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    pointerGesture = null;
    if (
      event.pointerType !== 'touch'
      || !event.isPrimary
      || !canArm(event)
    ) return;
    const scene = options.sceneAtBoundary();
    if (!scene) return;
    pointerGesture = {
      pointerId: event.pointerId,
      scene,
      startY: event.clientY
    };
    root.dataset.phoneLabContactReverseGesture = `${scene}:armed`;
  };

  const onPointerMove = (event: PointerEvent) => {
    const gesture = pointerGesture;
    if (
      !gesture
      || gesture.pointerId !== event.pointerId
      || !phoneLabContactHasReverseGestureIntent(
        gesture.startY,
        event.clientY
      )
    ) return;
    begin(gesture.scene);
  };

  const clearPointer = (event: PointerEvent) => {
    if (pointerGesture?.pointerId !== event.pointerId) return;
    pointerGesture = null;
    clearDatasetIfIdle();
  };

  const touchWithIdentifier = (
    touches: TouchList,
    identifier: number
  ): Touch | null => {
    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches.item(index);
      if (touch?.identifier === identifier) return touch;
    }
    return null;
  };

  const onTouchStart = (event: TouchEvent) => {
    touchGesture = null;
    if (event.touches.length !== 1 || !canArm(event)) return;
    const scene = options.sceneAtBoundary();
    const touch = event.touches.item(0);
    if (!scene || !touch) return;
    touchGesture = {
      identifier: touch.identifier,
      scene,
      startY: touch.clientY
    };
    root.dataset.phoneLabContactReverseGesture = `${scene}:armed`;
  };

  const onTouchMove = (event: TouchEvent) => {
    const gesture = touchGesture;
    if (!gesture) return;
    const touch = touchWithIdentifier(event.touches, gesture.identifier);
    if (
      !touch
      || !phoneLabContactHasReverseGestureIntent(
        gesture.startY,
        touch.clientY
      )
    ) return;
    if (event.cancelable) event.preventDefault();
    begin(gesture.scene);
  };

  const clearTouch = (event: TouchEvent) => {
    const gesture = touchGesture;
    if (!gesture || touchWithIdentifier(event.touches, gesture.identifier)) {
      return;
    }
    touchGesture = null;
    clearDatasetIfIdle();
  };

  root.addEventListener('pointerdown', onPointerDown, { passive: true });
  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerup', clearPointer, { passive: true });
  root.addEventListener('pointercancel', clearPointer, { passive: true });
  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('touchend', clearTouch, { passive: true });
  root.addEventListener('touchcancel', clearTouch, { passive: true });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      pointerGesture = null;
      touchGesture = null;
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', clearPointer);
      root.removeEventListener('pointercancel', clearPointer);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', clearTouch);
      root.removeEventListener('touchcancel', clearTouch);
      delete root.dataset.phoneLabContactReverseGesture;
    }
  };
}
