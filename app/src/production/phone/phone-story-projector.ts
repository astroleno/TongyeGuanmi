import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import {
  phoneEdgeSurfaceForScene
} from './phone-edge-surface';
import type { PhoneRouteScope } from './phone-route-scope';
import type { PhonePresentationProjection } from './phone-story-presentation';
import type { PhoneStorySnapshot } from './phone-story-state';

export type PhoneSurfaceKind = 'native' | 'fixed' | 'transition';

export type PhoneSurfaceRole =
  | 'stable'
  | 'candidate-stable'
  | 'fixed-current'
  | 'transition-source'
  | 'transition-receiver'
  | 'retained-under-stage'
  | 'retired';

export type PhoneSurfaceRegistration = Readonly<{
  id: string;
  scene: SceneId;
  kind: PhoneSurfaceKind;
  root(): HTMLElement | null;
  coverageRoot?(): HTMLElement | null;
  presented?(): boolean;
}>;

export type PhoneSurfaceLease = Readonly<{ dispose(): void }>;

export type PhoneTransitionEndpoints = Readonly<{
  source: HTMLElement;
  receiver: HTMLElement;
  sessionId: string;
  generation: number;
}>;

type ResolvedSurface = Readonly<{
  registration: PhoneSurfaceRegistration;
  root: HTMLElement;
  coverageRoot: HTMLElement;
  role: PhoneSurfaceRole;
}>;

export type PhoneStoryProjectionPlan = Readonly<{
  snapshot: PhoneStorySnapshot;
  root: HTMLElement | null;
  surfaces: readonly ResolvedSurface[];
  endpoints: PhoneTransitionEndpoints | null;
  checkpointTrace: readonly PhoneCheckpointId[];
}>;

export type PhoneStoryProjector = Readonly<{
  attach(): void;
  preflight(snapshot: PhoneStorySnapshot): PhoneStoryProjectionPlan | null;
  apply(plan: PhoneStoryProjectionPlan): void;
  reapplyCurrent(): void;
  registerSurface(registration: PhoneSurfaceRegistration): PhoneSurfaceLease;
  registerTransitionEndpoints(endpoints: PhoneTransitionEndpoints): void;
  clearTransitionEndpoints(): void;
  rootForScene(scene: SceneId): HTMLElement | null;
  dispose(): void;
}>;

type DocumentSnapshot = Readonly<{
  documentSurface: string;
  edge: string | undefined;
  checkpoint: string | undefined;
  theme: string | undefined;
}>;

type OwnedDocument = Readonly<{ token: object; before: DocumentSnapshot }>;

const rootOwners = new WeakMap<HTMLElement, object>();
const documentOwners = new WeakMap<Document, OwnedDocument>();
const rootDataKeys = [
  'phoneAuthorityId',
  'phoneAuthorityScope',
  'phoneCursor',
  'phoneRevision',
  'phoneSession',
  'phoneSegment',
  'phoneTransitionPhase',
  'phoneTransitionLock',
  'phoneInputState',
  'phoneScrollCorridor',
  'phoneScrollProgress',
  'phoneStageOwner',
  'phoneStageScene',
  'phoneProjectionState',
  'phoneStableScene',
  'phoneAnchorY',
  'phoneRetryableRun',
  'portraitCheckpoint',
  'portraitCheckpointTrace',
  'portraitEdgeScene',
  'portraitEdgeSurface',
  'portraitStageActive',
  'portraitAodMethodVisible'
] as const;

function data(
  element: HTMLElement,
  key: keyof DOMStringMap,
  value: string | undefined
): void {
  if (value === undefined) delete element.dataset[key];
  else element.dataset[key] = value;
}

function connected(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  return !('isConnected' in element) || element.isConnected !== false;
}

function themeMeta(documentRef: Document): HTMLMetaElement | null {
  return documentRef.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
}

function captureDocument(documentRef: Document): DocumentSnapshot {
  const documentElement = documentRef.documentElement;
  return {
    documentSurface: documentElement.style.getPropertyValue(
      '--portrait-document-surface'
    ),
    edge: documentElement.dataset.portraitEdgeScene,
    checkpoint: documentElement.dataset.portraitCheckpoint,
    theme: themeMeta(documentRef)?.content
  };
}

function restoreDocument(documentRef: Document, before: DocumentSnapshot): void {
  const documentElement = documentRef.documentElement;
  if (before.documentSurface) {
    documentElement.style.setProperty(
      '--portrait-document-surface',
      before.documentSurface
    );
  } else {
    documentElement.style.removeProperty('--portrait-document-surface');
  }
  if (before.edge) documentElement.dataset.portraitEdgeScene = before.edge;
  else delete documentElement.dataset.portraitEdgeScene;
  if (before.checkpoint) documentElement.dataset.portraitCheckpoint = before.checkpoint;
  else delete documentElement.dataset.portraitCheckpoint;
  const theme = themeMeta(documentRef);
  if (theme && before.theme !== undefined) theme.content = before.theme;
}

function roleFor(
  snapshot: PhoneStorySnapshot,
  projection: PhonePresentationProjection,
  registration: PhoneSurfaceRegistration
): PhoneSurfaceRole {
  if (registration.id === projection.receiverSurface) {
    if (snapshot.status === 'stable') {
      return registration.kind === 'fixed' ? 'fixed-current' : 'stable';
    }
    return projection.commitState === 'candidate'
      ? 'candidate-stable'
      : 'transition-receiver';
  }
  if (registration.id === projection.sourceSurface) return 'transition-source';
  if (registration.kind === 'fixed' && projection.stageOwner !== 'native') {
    return 'fixed-current';
  }
  return snapshot.status === 'stable' ? 'retired' : 'retained-under-stage';
}

function executionEndpoints(
  snapshot: PhoneStorySnapshot,
  endpoints: PhoneTransitionEndpoints | null
): PhoneTransitionEndpoints | null {
  return snapshot.status === 'transaction' ? endpoints : null;
}

export function createPhoneStoryProjector({
  authorityId,
  scope,
  root
}: Readonly<{
  authorityId: string;
  scope: PhoneRouteScope;
  root: () => HTMLElement | null;
}>): PhoneStoryProjector {
  const token = {};
  const registrations = new Map<string, PhoneSurfaceRegistration>();
  const ownedRoots = new Set<HTMLElement>();
  let attached = false;
  let disposed = false;
  let endpoints: PhoneTransitionEndpoints | null = null;
  let checkpointTrace: readonly PhoneCheckpointId[] = [];
  let latestPlan: PhoneStoryProjectionPlan | null = null;

  const ownRoot = (element: HTMLElement) => {
    rootOwners.set(element, token);
    ownedRoots.add(element);
  };
  const ownDocument = (documentRef: Document) => {
    const existing = documentOwners.get(documentRef);
    if (!existing || existing.token !== token) {
      documentOwners.set(documentRef, {
        token,
        before: existing?.before ?? captureDocument(documentRef)
      });
    }
  };
  const nextTrace = (checkpoint: PhoneCheckpointId): readonly PhoneCheckpointId[] => {
    if (checkpointTrace.at(-1) === checkpoint) return checkpointTrace;
    return [...checkpointTrace.slice(-63), checkpoint];
  };
  const documentRef = () => typeof document === 'undefined' ? null : document;

  return {
    attach() {
      if (!disposed) attached = true;
    },
    preflight(snapshot) {
      if (disposed) return null;
      const routeRoot = root();
      if ((attached && !routeRoot) || (routeRoot && !connected(routeRoot))) {
        return null;
      }
      const projection = snapshot.projection;
      const surfaces: ResolvedSurface[] = [];
      for (const registration of registrations.values()) {
        const selected = registration.id === projection.receiverSurface
          || registration.id === projection.sourceSurface;
        const surfaceRoot = registration.root();
        const coverageRoot = registration.coverageRoot?.() ?? surfaceRoot;
        if (selected && (!connected(surfaceRoot) || !connected(coverageRoot))) {
          return null;
        }
        if (!connected(surfaceRoot) || !connected(coverageRoot)) continue;
        if (selected && registration.presented && !registration.presented()) return null;
        surfaces.push({
          registration,
          root: surfaceRoot,
          coverageRoot,
          role: roleFor(snapshot, projection, registration)
        });
      }
      return {
        snapshot,
        root: routeRoot,
        surfaces,
        endpoints: executionEndpoints(snapshot, endpoints),
        checkpointTrace: nextTrace(projection.checkpoint)
      };
    },
    apply(plan) {
      if (disposed) return;
      const { snapshot, root: routeRoot, surfaces } = plan;
      const projection = snapshot.projection;
      if (routeRoot) {
        ownRoot(routeRoot);
        const cursor = snapshot.status === 'stable'
          ? `hold:${snapshot.scene}`
          : snapshot.status === 'scroll-run'
            ? `transition:${snapshot.run}:0`
            : `transition:${snapshot.session.operation.run}:${snapshot.session.operation.legIndex}`;
        const session = snapshot.status === 'transaction' ? snapshot.session : null;
        const edgeSurface = phoneEdgeSurfaceForScene(projection.edge);
        data(routeRoot, 'phoneAuthorityId', authorityId);
        data(routeRoot, 'phoneAuthorityScope', scope);
        data(routeRoot, 'phoneCursor', cursor);
        data(routeRoot, 'phoneRevision', String(snapshot.revision));
        data(routeRoot, 'phoneSession', session?.sessionId);
        data(routeRoot, 'phoneSegment', snapshot.status === 'transaction'
          ? snapshot.projection.checkpoint
          : undefined);
        data(routeRoot, 'phoneTransitionPhase', session?.phase);
        data(routeRoot, 'phoneTransitionLock', session ? 'locked' : undefined);
        data(routeRoot, 'phoneInputState', session ? 'locked' : 'free');
        data(routeRoot, 'phoneScrollCorridor', snapshot.scroll.corridor ?? undefined);
        data(routeRoot, 'phoneScrollProgress', snapshot.scroll.progress.toFixed(4));
        data(routeRoot, 'phoneStageOwner', projection.stageOwner);
        data(routeRoot, 'phoneStageScene', projection.stageScene ?? 'none');
        data(routeRoot, 'phoneProjectionState', projection.commitState);
        data(routeRoot, 'phoneStableScene', snapshot.status === 'stable'
          ? snapshot.scene
          : undefined);
        data(routeRoot, 'phoneAnchorY', session?.anchor.y === null || !session
          ? undefined
          : String(Math.round(session.anchor.y)));
        data(routeRoot, 'phoneRetryableRun', snapshot.diagnostics.lastRollback?.run);
        data(routeRoot, 'portraitCheckpoint', projection.checkpoint);
        data(routeRoot, 'portraitCheckpointTrace', plan.checkpointTrace.join('>'));
        data(routeRoot, 'portraitEdgeScene', projection.edge);
        data(routeRoot, 'portraitEdgeSurface', edgeSurface);
        data(routeRoot, 'portraitStageActive', projection.stageOwner === 'native'
          ? 'false'
          : 'true');
        data(routeRoot, 'portraitAodMethodVisible', snapshot.status === 'stable'
          && snapshot.scene === 'method-top' ? 'true' : 'false');
        routeRoot.style?.setProperty('--portrait-edge-surface', edgeSurface);
        const stageViewport = routeRoot.querySelector?.(
          '.portrait-scroll-spike__stage-viewport'
        );
        if (
          typeof HTMLElement !== 'undefined'
          && stageViewport instanceof HTMLElement
        ) {
          data(stageViewport, 'portraitEdgeScene', projection.edge);
        }
        const page = documentRef();
        if (page) {
          ownDocument(page);
          page.documentElement.style.setProperty(
            '--portrait-document-surface',
            edgeSurface
          );
          page.documentElement.dataset.portraitEdgeScene = projection.edge;
          page.documentElement.dataset.portraitCheckpoint = projection.checkpoint;
          const theme = themeMeta(page);
          if (theme) theme.content = edgeSurface;
        }
      }
      for (const surface of surfaces) {
        data(surface.root, 'phoneSurfaceRole', surface.role);
        delete surface.root.dataset.phoneBoundarySession;
        delete surface.root.dataset.phoneBoundaryGeneration;
        delete surface.root.dataset.phoneBoundaryEndpoint;
      }
      if (plan.endpoints) {
        const { source, receiver, sessionId, generation } = plan.endpoints;
        data(source, 'phoneSurfaceRole', 'transition-source');
        data(receiver, 'phoneSurfaceRole', 'transition-receiver');
        for (const [element, endpoint] of [[source, 'source'], [receiver, 'receiver']] as const) {
          data(element, 'phoneBoundarySession', sessionId);
          data(element, 'phoneBoundaryGeneration', String(generation));
          data(element, 'phoneBoundaryEndpoint', endpoint);
        }
      }
      checkpointTrace = plan.checkpointTrace;
      latestPlan = plan;
    },
    reapplyCurrent() {
      if (latestPlan) this.apply(latestPlan);
    },
    registerSurface(registration) {
      registrations.set(registration.id, registration);
      return {
        dispose() {
          if (registrations.get(registration.id) === registration) {
            registrations.delete(registration.id);
          }
        }
      };
    },
    registerTransitionEndpoints(next) {
      endpoints = next;
    },
    clearTransitionEndpoints() {
      endpoints = null;
    },
    rootForScene(scene) {
      for (const registration of registrations.values()) {
        if (registration.scene === scene) return registration.root();
      }
      return null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      endpoints = null;
      registrations.clear();
      for (const ownedRoot of ownedRoots) {
        if (rootOwners.get(ownedRoot) === token) {
          for (const key of rootDataKeys) data(ownedRoot, key, undefined);
          ownedRoot.style?.removeProperty('--portrait-edge-surface');
          rootOwners.delete(ownedRoot);
        }
      }
      ownedRoots.clear();
      const page = documentRef();
      if (page) {
        const owner = documentOwners.get(page);
        if (owner?.token === token) {
          restoreDocument(page, owner.before);
          documentOwners.delete(page);
        }
      }
    }
  };
}
