import type { SceneId } from '../../story/types';
import { createPhoneStoryOrchestrator } from './phone-story-orchestrator';
import type {
  PhoneStoryRuntimePort
} from './phone-story-orchestrator.types';
import { createPhoneStoryProjector } from './phone-story-projector';
import type { PhoneRouteScope } from './phone-route-scope';
import { createPhoneIntentCoordinator } from './phone-transition-coordinator';
import {
  createPhoneDocumentScrollRuntime
} from './usePhoneDocumentScrollRuntime';

export type PhoneStoryAuthority = Readonly<{
  authorityId: string;
  scope: PhoneRouteScope;
  /** The only value route descendants may receive through Context. */
  port: PhoneStoryRuntimePort;
  attach(): void;
  dispose(): void;
}>;

export type CreatePhoneStoryRuntimeOptions = Readonly<{
  scope: PhoneRouteScope;
  initialScene: SceneId;
  root: () => HTMLElement | null;
  scrollY: () => number;
  scrollTo: (y: number) => void;
  scheduleFrame?: ((callback: () => void) => void) | undefined;
}>;

let authoritySequence = 0;
// This is a lifetime guard, not a shared runtime: each value is a distinct
// route-local authority and the weak key vanishes with its mounted root.
const attachedAuthorityByRoot = new WeakMap<HTMLElement, PhoneStoryAuthority>();

/**
 * The only route-local phone authority assembly root. Construction creates no
 * listeners, timers, media lease, DOM token, or global singleton; attach()
 * owns the route lifetime and dispose() invalidates every child handle.
 */
export function createPhoneStoryRuntime(
  options: CreatePhoneStoryRuntimeOptions
): PhoneStoryAuthority {
  const authorityId = `phone-authority-${++authoritySequence}`;
  const projector = createPhoneStoryProjector({
    authorityId,
    scope: options.scope,
    root: options.root
  });
  const engine = createPhoneStoryOrchestrator({
    authorityId,
    initialScene: options.initialScene,
    root: options.root,
    scrollY: options.scrollY,
    scrollTo: options.scrollTo,
    projector,
    ...(options.scheduleFrame ? { scheduleFrame: options.scheduleFrame } : {})
  });
  const port: PhoneStoryRuntimePort = engine;
  let attached = false;
  let disposed = false;
  let disposeCoordinator: (() => void) | undefined;
  let disposeDocumentScrollRuntime: (() => void) | undefined;
  let disposeBrowserReapply: (() => void) | undefined;

  let authority: PhoneStoryAuthority;
  authority = {
    authorityId,
    scope: options.scope,
    port,
    attach() {
      if (disposed || attached) return;
      const root = options.root();
      if (!root) return;
      const prior = attachedAuthorityByRoot.get(root);
      if (prior && prior !== authority) prior.dispose();
      attachedAuthorityByRoot.set(root, authority);
      attached = true;
      projector.attach();
      port.syncDiagnostics();
      const page = root.ownerDocument;
      const pageWindow = page?.defaultView;
      if (pageWindow && page) {
        const reapplyCurrentProjection = () => projector.reapplyCurrent();
        pageWindow.addEventListener('pageshow', reapplyCurrentProjection);
        page.addEventListener('visibilitychange', reapplyCurrentProjection);
        disposeBrowserReapply = () => {
          pageWindow.removeEventListener('pageshow', reapplyCurrentProjection);
          page.removeEventListener('visibilitychange', reapplyCurrentProjection);
        };
      }
      if (pageWindow) {
        const scrollRuntime = createPhoneDocumentScrollRuntime({
          page: pageWindow,
          document: page,
          visualViewport: pageWindow.visualViewport,
          registry: engine.scrollCorridors,
          getSnapshot: port.getSnapshot,
          dispatch: port.dispatch,
          requestFrame: pageWindow.requestAnimationFrame.bind(pageWindow),
          cancelFrame: pageWindow.cancelAnimationFrame.bind(pageWindow)
        });
        disposeDocumentScrollRuntime = scrollRuntime.dispose;
        disposeCoordinator = createPhoneIntentCoordinator(
          root,
          engine.resolveIntent,
          {
            scrollY: options.scrollY,
            scrollTo: options.scrollTo,
            scrollState: () => {
              const snapshot = port.getSnapshot();
              return {
                revision: snapshot.revision,
                corridor: snapshot.scroll.corridor
              };
            },
            onNativeScrollCorrection: scrollRuntime.sampleNow
          }
        ).dispose;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeCoordinator?.();
      disposeCoordinator = undefined;
      disposeDocumentScrollRuntime?.();
      disposeDocumentScrollRuntime = undefined;
      disposeBrowserReapply?.();
      disposeBrowserReapply = undefined;
      const root = options.root();
      if (root && attachedAuthorityByRoot.get(root) === authority) {
        attachedAuthorityByRoot.delete(root);
      }
      engine.dispose();
    }
  };
  return authority;
}
