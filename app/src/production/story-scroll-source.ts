import Lenis from 'lenis';

export type StoryScrollSource = Readonly<{
  position(): number;
  seek(position: number): void;
  resize(): void;
  requestRender(): void;
  suspend(): void;
  resume(): void;
  dispose(): void;
}>;

/** The only scrolling/frame owner. Video callbacks may wake it, never advance it. */
export function createStoryScrollSource(onFrame: (position: number, now: number) => void,
  { syncTouch = false }: { syncTouch?: boolean } = {}): StoryScrollSource {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let nativeTouchGesture = false;
  const lenis = new Lenis({ autoRaf: false, autoResize: false, syncTouch: syncTouch && !reduced.matches,
    // Keep Lenis' touch curve separate from wheel smoothing: drag at 1:1,
    // then use its standard release inertia. No second delta integrator.
    touchMultiplier: 1, syncTouchLerp: .075, touchInertiaExponent: 1.7,
    smoothWheel: !reduced.matches, lerp: .18, anchors: false,
    virtualScroll: ({ event }) => allowGesture(event),
    prevent: (element) => Boolean(element.closest('[data-lenis-prevent], input, textarea, select, [contenteditable]:not([contenteditable="false"]), .site-nav[data-menu-open="true"]')) });
  let frame = 0;
  let disposed = false;
  let suspended = false;
  // Native events can arrive while Lenis ignores its own immediate-scroll event.
  // Outside an active smooth animation the document, not animatedScroll, owns position.
  const position = () => lenis.isScrolling === 'smooth' ? lenis.scroll : lenis.actualScroll;
  const wake = () => {
    if (!disposed && !suspended && !frame) frame = requestAnimationFrame(tick);
  };
  const tick = (now: number) => {
    frame = 0;
    if (disposed || suspended) return;
    lenis.raf(now);
    onFrame(position(), now);
    if (lenis.isScrolling === 'smooth') wake();
  };
  const cancel = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  const cancelTouch = () => {
    nativeTouchGesture = true;
    lenis.scrollTo(lenis.actualScroll, { immediate: true, force: true }); wake();
  };
  function allowGesture(event: TouchEvent | WheelEvent): boolean {
    if (!lenis.options.syncTouch || !('touches' in event)) return true;
    if (event.type === 'touchstart' && event.touches.length === 1) nativeTouchGesture = false;
    if (event.touches.length > 1 || (window.visualViewport?.scale ?? 1) > 1
      || document.getSelection()?.isCollapsed === false) cancelTouch();
    // Once a pinch/selection owns the gesture, do not resume Lenis when one
    // finger remains or synthesize inertia from its final touchend.
    return !nativeTouchGesture;
  }
  const offVirtual = lenis.on('virtual-scroll', wake);
  // Native touch, scrollbar, browser restoration and keyboard all use this path.
  window.addEventListener('scroll', wake, { passive: true });
  if (syncTouch) window.addEventListener('touchcancel', cancelTouch, { passive: true });
  const seek = (position: number) => {
    lenis.scrollTo(Number.isFinite(position) ? position : 0, { immediate: true, force: true });
    wake();
  };
  const motionChanged = () => {
    lenis.options.smoothWheel = !reduced.matches;
    lenis.options.syncTouch = syncTouch && !reduced.matches;
    nativeTouchGesture = false;
    seek(lenis.actualScroll);
  };
  reduced.addEventListener('change', motionChanged);
  wake();
  return Object.freeze({
    position,
    seek,
    resize: () => { lenis.resize(); wake(); },
    requestRender: wake,
    suspend: () => {
      suspended = true;
      cancel();
      lenis.scrollTo(lenis.actualScroll, { immediate: true, force: true });
    },
    resume: () => { suspended = false; lenis.resize(); seek(lenis.actualScroll); },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancel();
      offVirtual();
      window.removeEventListener('scroll', wake);
      if (syncTouch) window.removeEventListener('touchcancel', cancelTouch);
      reduced.removeEventListener('change', motionChanged);
      lenis.destroy();
    }
  });
}
