import {
  createInkFieldRenderer,
  mountTransitionInkCanvas,
  type InkFieldRenderer,
  type InkGradePreset
} from '../../transitions/shared/sceneInk';
import {
  createInkFieldFrame,
  type InkFieldSpec
} from '../../transitions/shared/inkField';
import {
  applyConcealBoundary,
  applyRevealBoundary,
  clearBoundaryGeometry
} from '../../transitions/shared/inkOwnership';
import {
  acquirePhoneBoundaryGeometryLease,
  type PhoneBoundaryGeometryLease
} from './phone-boundary-geometry';
import type { PhoneCinematicRequest } from './types';

export type PhoneInkTransition = Readonly<{
  begin(request: PhoneCinematicRequest): void;
  render(progress: number): void;
  commitEndpoint(endpoint: 0 | 1): void;
  releaseEndpoint(): void;
  dispose(): void;
}>;

/** Endpoint tolerance shared by ink visibility and browser-edge ownership. */
export const PHONE_INK_ENDPOINT_EPSILON = 0.001;

/** Clear transition-owned clip/mask state before the runtime changes owners. */
export function clearPhoneInkBoundary(element: HTMLElement): void {
  clearBoundaryGeometry(element);
}

type PhoneInkTransitionOptions = Readonly<{
  host: HTMLElement | null;
  canvas: HTMLCanvasElement | null;
  id: string;
  /**
   * Keep both endpoints mounted during a handoff. The field's complementary
   * masks become the actual ownership boundary, rather than a decorative
   * overlay rendered on an already-completed scene change.
   */
  from?: HTMLElement | null;
  /** A document source that must follow the same conceal contour as `from`. */
  additionalFrom?: HTMLElement | null;
  to?: HTMLElement | null;
  field: InkFieldSpec;
  grade?: InkGradePreset;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function viewportFor(canvas: HTMLCanvasElement, host: HTMLElement): Readonly<{ width: number; height: number }> {
  return {
    width: Math.max(1, canvas.clientWidth || host.clientWidth || window.innerWidth || 1),
    height: Math.max(1, canvas.clientHeight || host.clientHeight || window.innerHeight || 1)
  };
}

/**
 * Route B has native document scroll rather than the production Director, but
 * it still uses the same shader-backed ink field that production transitions
 * own. The component maps each outgoing sticky section's local progress into
 * this small surface instead of substituting an opacity fade.
 */
export function createPhoneInkTransition(
  options: PhoneInkTransitionOptions
): PhoneInkTransition {
  const host = options.host;
  const canvasClassName = options.canvas?.className || 'phone-story-shell__ink';
  const surface = mountTransitionInkCanvas(host, options.id, {
    renderer: 'field',
    grade: options.grade ?? 'dark',
    generation: `phone-story:${options.id}`,
    className: canvasClassName
  }, options.canvas ?? undefined);

  if (!surface || !host) {
    const noop = () => undefined;
    return {
      begin: noop,
      render: noop,
      commitEndpoint: noop,
      releaseEndpoint: noop,
      dispose: noop
    };
  }

  const mountedCanvas = options.canvas ? null : surface;

  const spec = options.field;
  const renderer: InkFieldRenderer | null = createInkFieldRenderer(surface, {
    fieldKind: spec.kind,
    grade: options.grade ?? 'dark',
    generation: `phone-story:${options.id}`,
    removeCanvasOnDestroy: false,
    loseContextOnDestroy: false
  });
  let lastProgress = Number.NaN;
  let geometryLease: PhoneBoundaryGeometryLease | undefined;
  const sourceEndpoints = [options.from, options.additionalFrom].filter(
    (element, index, elements): element is HTMLElement => (
      Boolean(element) && elements.indexOf(element) === index
    )
  );

  const begin = (request: PhoneCinematicRequest) => {
    geometryLease?.releaseGeometry();
    geometryLease = acquirePhoneBoundaryGeometryLease(
      [...sourceEndpoints, options.to],
      request.geometryOwner ?? request.identity,
      clearBoundaryGeometry
    );
  };

  const applyOwnership = (progress: number) => {
    const frame = createInkFieldFrame(spec, progress, viewportFor(surface, host));
    for (const source of sourceEndpoints) {
      if (
        spec.kind === 'radial'
        && progress > PHONE_INK_ENDPOINT_EPSILON
        && progress < 1 - PHONE_INK_ENDPOINT_EPSILON
      ) {
        // A radial receiver is the upper surface. Keep the source intact
        // underneath it instead of hiding the source as soon as the circle
        // begins to grow.
        source.style.visibility = 'visible';
        clearBoundaryGeometry(source);
      } else {
        applyConcealBoundary(source, frame);
      }
    }
    if (options.to) {
      // The receiver owns the authored contour. Horizontal handoffs also
      // conceal the source; radial handoffs keep the source intact underneath
      // the growing receiver surface.
      applyRevealBoundary(options.to, frame);
    }
    return frame;
  };

  if (import.meta.env.DEV) {
    surface.dataset.phoneInkRenderer = renderer ? 'active' : 'unavailable';
  }
  if (renderer) {
    renderer.prewarm(createInkFieldFrame(spec, 0.003, viewportFor(surface, host)));
  }

  const render = (rawProgress: number) => {
    if (!geometryLease) {
      begin({
        identity: {
          authorityId: `phone-ink:${options.id}`,
          sessionId: `phone-ink:${options.id}`,
          generation: 0,
          leg: 0,
          direction: 1
        }
      });
    }
    const progress = clamp(rawProgress);
    const rendererNeedsFrame = Math.abs(progress - lastProgress) >= 0.0005;
    lastProgress = progress;
    if (import.meta.env.DEV) {
      surface.dataset.phoneInkProgress = progress.toFixed(4);
    }
    // The WebGL surface is an edge field, not a permanent black overlay.
    // Explicit endpoint visibility is especially important after a fast
    // touch scroll skips directly from a mid-handoff sample to its target.
    const fieldActive = progress > PHONE_INK_ENDPOINT_EPSILON
      && progress < 1 - PHONE_INK_ENDPOINT_EPSILON;
    surface.style.visibility = fieldActive ? 'visible' : 'hidden';
    surface.style.opacity = fieldActive ? '1' : '0';
    const frame = applyOwnership(progress);
    if (rendererNeedsFrame) {
      renderer?.render(frame);
    }
  };

  const releaseEndpoint = () => {
    geometryLease?.releaseGeometry();
    geometryLease = undefined;
  };

  return {
    begin,
    render,
    commitEndpoint(endpoint) {
      render(endpoint);
    },
    releaseEndpoint,
    dispose() {
      renderer?.destroy();
      releaseEndpoint();
      surface.style.removeProperty('visibility');
      surface.style.removeProperty('opacity');
      if (import.meta.env.DEV) {
        delete surface.dataset.phoneInkRenderer;
        delete surface.dataset.phoneInkProgress;
      }
      mountedCanvas?.remove();
    }
  };
}
