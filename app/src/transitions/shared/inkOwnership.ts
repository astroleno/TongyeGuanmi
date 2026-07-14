import {
  clearHorizontalInkDiagnostics,
  inkFieldOrigin,
  markHorizontalInkDiagnostics,
  type HorizontalInkFieldFrame,
  type InkFieldFrame
} from './inkField';

export function clearBoundaryGeometry(element: HTMLElement | null | undefined): void {
  if (!element) {
    return;
  }
  element.style.clipPath = '';
  element.style.removeProperty('clip-path');
  element.style.removeProperty('-webkit-clip-path');
  element.removeAttribute('data-r4-reveal-progress');
  element.removeAttribute('data-r4-reveal-mode');
  element.removeAttribute('data-r4-ink-boundary-kind');
  element.removeAttribute('data-r4-ink-boundary-origin');
  element.removeAttribute('data-r4-ink-boundary-progress');
  element.removeAttribute('data-r4-ink-field-seed');
  element.removeAttribute('data-r4-ink-ownership');
  clearHorizontalInkDiagnostics(element);
}

function isHorizontalFrame(frame: InkFieldFrame): frame is HorizontalInkFieldFrame {
  return frame.spec.kind === 'horizontal';
}

function applyBoundaryGeometry(
  element: HTMLElement,
  frame: InkFieldFrame,
  clipPath: string,
  ownership: 'reveal' | 'conceal'
): void {
  const origin = inkFieldOrigin(frame.spec);
  element.style.clipPath = clipPath;
  element.style.setProperty('-webkit-clip-path', clipPath);
  element.dataset.r4InkBoundaryKind = frame.spec.kind;
  element.dataset.r4InkBoundaryOrigin = `${origin.x.toFixed(4)},${origin.y.toFixed(4)}`;
  element.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  element.dataset.r4InkFieldSeed = String(frame.seed);
  element.dataset.r4InkOwnership = ownership;
  if (isHorizontalFrame(frame)) {
    markHorizontalInkDiagnostics(element, frame);
  } else {
    clearHorizontalInkDiagnostics(element);
  }
}

export function applyRevealBoundary(element: HTMLElement, frame: InkFieldFrame): void {
  if (frame.progress >= 0.999) {
    clearBoundaryGeometry(element);
    return;
  }
  if (!frame.ownership.revealClip) {
    clearBoundaryGeometry(element);
    return;
  }
  applyBoundaryGeometry(element, frame, frame.ownership.revealClip, 'reveal');
  element.dataset.r4RevealProgress = frame.progress.toFixed(4);
  element.dataset.r4RevealMode = 'ink-occluded-live-gate';
}

export function applyConcealBoundary(element: HTMLElement, frame: InkFieldFrame): void {
  if (frame.progress <= 0.001) {
    element.style.visibility = 'visible';
    clearBoundaryGeometry(element);
    return;
  }
  if (frame.progress >= 0.999 || !frame.ownership.concealClip) {
    element.style.visibility = 'hidden';
    clearBoundaryGeometry(element);
    return;
  }
  element.style.visibility = 'visible';
  applyBoundaryGeometry(element, frame, frame.ownership.concealClip, 'conceal');
}
