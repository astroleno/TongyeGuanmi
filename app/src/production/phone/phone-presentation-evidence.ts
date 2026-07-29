import type { SceneId } from '../../story/types';
import type { PhonePresentationEvidenceKind } from './phone-presentation-contract';
import { phoneScenePresentationTuple } from './phone-presentation-contract';

/** Projector preflight may reveal a dormant owned root in its same revision. */
export type PhoneSurfacePresentationReadMode = 'preflight' | 'committed';

/**
 * Positional DOM facts cross the projector/orchestrator boundary without
 * relying on independently-mangled property names.
 */
export type PhoneSurfacePresentation = readonly [
  connected: boolean,
  visible: boolean,
  coverage: boolean,
  content: boolean,
  frameKind: Exclude<
    PhonePresentationEvidenceKind,
    'coverage' | 'dom-reading' | 'direct-entry'
  > | null
];

type RectLike = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

function connected(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  return !('isConnected' in element) || element.isConnected !== false;
}

function rectFor(element: HTMLElement): RectLike | null {
  const reader = element.getBoundingClientRect;
  if (typeof reader !== 'function') return null;
  const rect = reader.call(element);
  return rect ?? null;
}

function visible(
  element: HTMLElement,
  mode: PhoneSurfacePresentationReadMode
): boolean {
  if ('hidden' in element && element.hidden) return false;
  if ('inert' in element && element.inert) return false;
  if (element.hasAttribute?.('inert')) return false;
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(element);
    if (
      style.display === 'none'
      // A selected surface is still hidden by the previous projector role
      // while preflight runs. The next atomic role application reveals it;
      // committed/direct-entry reads never receive this exception.
      || (mode !== 'preflight'
        && (style.visibility === 'hidden' || style.visibility === 'collapse'))
      || Number.parseFloat(style.opacity || '1') <= 0.01
    ) return false;
  }
  const rect = rectFor(element);
  return !rect || (rect.width > 0 && rect.height > 0);
}

function coversLiveViewport(element: HTMLElement): boolean {
  const rect = rectFor(element);
  if (!rect || typeof window === 'undefined') return true;
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  if (width <= 0 || height <= 0) return false;
  const epsilon = .5;
  return rect.left <= left + epsilon
    && rect.top <= top + epsilon
    && rect.right >= left + width - epsilon
    && rect.bottom >= top + height - epsilon;
}

function intersectsLiveViewport(element: HTMLElement): boolean {
  const rect = rectFor(element);
  if (!rect || typeof window === 'undefined') return true;
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const right = left + (viewport?.width ?? window.innerWidth);
  const bottom = top + (viewport?.height ?? window.innerHeight);
  return rect.right > left
    && rect.left < right
    && rect.bottom > top
    && rect.top < bottom;
}

function elementForProbe(
  root: HTMLElement,
  selector: string
): HTMLElement | null {
  if (typeof root.matches === 'function' && root.matches(selector)) return root;
  return root.querySelector?.<HTMLElement>(selector) ?? null;
}

function hasTextProbe(
  root: HTMLElement,
  selectors: readonly string[],
  reading: boolean,
  mode: PhoneSurfacePresentationReadMode
): boolean {
  return selectors.length > 0 && selectors.every((selector) => {
    const element = elementForProbe(root, selector);
    if (!element?.textContent?.trim()) return false;
    return !reading || (visible(element, mode) && intersectsLiveViewport(element));
  });
}

function hasFrameProbe(
  root: HTMLElement,
  selectors: readonly string[],
  mode: PhoneSurfacePresentationReadMode
): boolean {
  return selectors.length > 0 && selectors.every((selector) => {
    const element = elementForProbe(root, selector);
    return Boolean(element && visible(element, mode) && intersectsLiveViewport(element));
  });
}

/** Build evidence from the exact root and coverage plane registered by a surface. */
export function readPhoneSurfacePresentation(
  root: HTMLElement | null,
  coverageRoot: HTMLElement | null,
  mode: PhoneSurfacePresentationReadMode = 'committed'
): PhoneSurfacePresentation {
  const rootConnected = connected(root);
  const coverageConnected = connected(coverageRoot);
  const rootVisible = rootConnected && visible(root, mode);
  const coverageVisible = coverageConnected && visible(coverageRoot, mode);
  return [
    rootConnected && coverageConnected,
    rootVisible,
    coverageVisible && coversLiveViewport(coverageRoot),
    // Generic preflight proves only structural readiness. A wrapper's
    // descendants cannot be promoted to content or a compositor frame.
    false,
    null
  ];
}

/**
 * Manifest-scoped read for production routes. It refuses a generic descendant
 * as proof: text holds must expose their declared copy, and cinematic holds
 * must expose the declared real frame marker.
 */
export function readPhoneScenePresentation(
  scene: SceneId,
  root: HTMLElement | null,
  coverageRoot: HTMLElement | null,
  mode: PhoneSurfacePresentationReadMode = 'committed'
): PhoneSurfacePresentation {
  const [, , , , , , probeKind, selectors] = phoneScenePresentationTuple(scene);
  const rootConnected = connected(root);
  const coverageConnected = connected(coverageRoot);
  const rootVisible = rootConnected && visible(root, mode);
  const coverageVisible = coverageConnected && visible(coverageRoot, mode);
  const textContent = rootVisible
    && hasTextProbe(root, selectors, probeKind === 'reading', mode);
  const framePresented = rootVisible
    && hasFrameProbe(root, selectors, mode);
  const content = probeKind === 'visual' ? framePresented : textContent;
  const frameKind = probeKind === 'static' && textContent
    ? 'static-poster'
    : probeKind === 'visual' && framePresented
      ? 'packed-canvas-frame'
      : null;
  return [
    rootConnected && coverageConnected,
    rootVisible,
    coverageVisible && coversLiveViewport(coverageRoot),
    content,
    frameKind
  ];
}

export function phoneSurfaceSupportsEvidence(
  [connected, visible, coverage, content, frameKind]: PhoneSurfacePresentation,
  kind: PhonePresentationEvidenceKind
): boolean {
  switch (kind) {
    case 'coverage':
      return connected && coverage;
    case 'dom-reading':
      return connected && visible && content;
    case 'direct-entry':
      return connected && visible && coverage && content;
    case 'static-poster':
    case 'native-video-frame':
    case 'packed-canvas-frame':
    case 'effect-frame':
      return connected && visible && frameKind === kind;
  }
}
