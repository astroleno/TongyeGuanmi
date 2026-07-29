import { useLayoutEffect, type RefObject } from 'react';
import './phone-viewport-coverage.css';

export type PhoneLayoutViewport = Readonly<{
  width: number;
  height: number;
  revision: number;
}>;

export type PhoneCoverageViewport = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  revision: number;
}>;

type EventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

type PhoneVisualViewport = Readonly<{
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
}>;

export type PhoneViewportWindow = EventSource & Readonly<{
  innerWidth: number;
  innerHeight: number;
  visualViewport?: (EventSource & PhoneVisualViewport) | null;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}>;

export type PhoneViewportCoverageController = Readonly<{
  sync(forceLayout?: boolean): void;
  dispose(): void;
}>;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function rounded(value: number): number {
  return Math.max(1, Math.round(value));
}

/** Read the live Safari visual viewport without changing the layout clock. */
export function readPhoneCoverageViewport(
  source: Readonly<{
    innerWidth: number;
    innerHeight: number;
    visualViewport?: PhoneVisualViewport | null;
  }>,
  revision = 0
): PhoneCoverageViewport {
  const viewport = source.visualViewport;
  const width = rounded(finite(viewport?.width ?? source.innerWidth, source.innerWidth || 1));
  const height = rounded(finite(viewport?.height ?? source.innerHeight, source.innerHeight || 1));
  const left = Math.max(0, finite(viewport?.offsetLeft ?? 0, 0));
  const top = Math.max(0, finite(viewport?.offsetTop ?? 0, 0));
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    revision
  };
}

/** The layout camera changes only on width/orientation/fullscreen changes. */
export function readPhoneLayoutViewport(
  coverage: PhoneCoverageViewport,
  revision = 0
): PhoneLayoutViewport {
  return {
    width: coverage.width,
    height: coverage.height,
    revision
  };
}

function sameCoverage(
  left: PhoneCoverageViewport | null,
  right: PhoneCoverageViewport
): boolean {
  return Boolean(
    left
    && left.left === right.left
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
  );
}

/** CSS variables are a geometry publication, never a ScrollTrigger refresh. */
export function applyPhoneCoverageViewport(
  root: HTMLElement,
  coverage: PhoneCoverageViewport
): void {
  root.style.setProperty('--portrait-coverage-left', `${coverage.left}px`);
  root.style.setProperty('--portrait-coverage-top', `${coverage.top}px`);
  root.style.setProperty('--portrait-coverage-right', `${coverage.right}px`);
  root.style.setProperty('--portrait-coverage-bottom', `${coverage.bottom}px`);
  root.style.setProperty('--portrait-coverage-width', `${coverage.width}px`);
  root.style.setProperty('--portrait-coverage-height', `${coverage.height}px`);
  root.dataset.phoneCoverageRevision = String(coverage.revision);
}

export function clearPhoneCoverageViewport(root: HTMLElement): void {
  for (const property of [
    '--portrait-coverage-left',
    '--portrait-coverage-top',
    '--portrait-coverage-right',
    '--portrait-coverage-bottom',
    '--portrait-coverage-width',
    '--portrait-coverage-height'
  ]) root.style.removeProperty(property);
  delete root.dataset.phoneCoverageRevision;
}

/**
 * Coalesces visualViewport scroll/resize to one paint-plane revision per RAF.
 * Layout callbacks are deliberately limited to an initial/forced sync or a
 * material width change, so toolbar motion cannot refresh the scroll clock.
 */
export function createPhoneViewportCoverageController({
  root,
  windowRef,
  documentRef,
  onLayout
}: Readonly<{
  root: HTMLElement;
  windowRef: PhoneViewportWindow;
  documentRef: EventSource;
  onLayout(root: HTMLElement, layout: PhoneLayoutViewport): void;
}>): PhoneViewportCoverageController {
  let disposed = false;
  let frame = 0;
  let forceLayout = false;
  let coverage: PhoneCoverageViewport | null = null;
  let layout: PhoneLayoutViewport | null = null;
  let coverageRevision = 0;
  let layoutRevision = 0;

  const sync = (force = false) => {
    if (disposed) return;
    const observed = readPhoneCoverageViewport(windowRef, coverageRevision + 1);
    if (!sameCoverage(coverage, observed)) {
      coverageRevision += 1;
      coverage = { ...observed, revision: coverageRevision };
      applyPhoneCoverageViewport(root, coverage);
    }
    const currentCoverage = coverage ?? observed;
    const widthChanged = !layout || Math.abs(currentCoverage.width - layout.width) > 1;
    if (!force && !forceLayout && !widthChanged) return;
    layoutRevision += 1;
    layout = readPhoneLayoutViewport(currentCoverage, layoutRevision);
    forceLayout = false;
    onLayout(root, layout);
  };
  const schedule = () => {
    if (frame || disposed) return;
    frame = windowRef.requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };
  const scheduleForcedLayout = () => {
    forceLayout = true;
    schedule();
  };

  sync(true);
  windowRef.visualViewport?.addEventListener('resize', schedule);
  windowRef.visualViewport?.addEventListener('scroll', schedule);
  windowRef.addEventListener('resize', schedule);
  windowRef.addEventListener('orientationchange', scheduleForcedLayout);
  documentRef.addEventListener('fullscreenchange', scheduleForcedLayout);

  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) windowRef.cancelAnimationFrame(frame);
      windowRef.visualViewport?.removeEventListener('resize', schedule);
      windowRef.visualViewport?.removeEventListener('scroll', schedule);
      windowRef.removeEventListener('resize', schedule);
      windowRef.removeEventListener('orientationchange', scheduleForcedLayout);
      documentRef.removeEventListener('fullscreenchange', scheduleForcedLayout);
      clearPhoneCoverageViewport(root);
    }
  };
}

export function usePhoneViewportCoverage(
  rootRef: RefObject<HTMLElement | null>,
  onLayout: (root: HTMLElement, layout: PhoneLayoutViewport) => void
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return;
    const controller = createPhoneViewportCoverageController({
      root,
      windowRef: window,
      documentRef: document,
      onLayout
    });
    return () => controller.dispose();
  }, [onLayout, rootRef]);
}
