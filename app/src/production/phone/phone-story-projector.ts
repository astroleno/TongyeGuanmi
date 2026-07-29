import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import {
  phoneEdgeSurfaceForScene
} from './phone-edge-surface';
import type { PhoneRouteScope } from './phone-route-scope';
import type { PhonePresentationProjection } from './phone-story-presentation';
import type { PhoneStorySnapshot } from './phone-story-state';
import { phoneRun, phoneScrollRun } from './phone-story-runs';
import {
  readPhoneScenePresentation,
  readPhoneSurfacePresentation,
  type PhoneSurfacePresentation,
  type PhoneSurfacePresentationReadMode
} from './phone-presentation-evidence';
import {
  phoneScenePresentationTuple,
  phoneSegmentPresentationTuple
} from './phone-presentation-contract';
import {
  canonicalPhoneEffectSegment,
  phoneLayerForSurfaceRole,
  phoneTransitionLayerPlan,
  type PhonePresentationLayer,
  type PhoneSurfaceRole,
  type PhoneTransitionLayerPlan
} from './phone-presentation-layers';

export type PhoneSurfaceKind = 'native' | 'fixed' | 'transition';

export type { PhoneSurfaceRole } from './phone-presentation-layers';

export type PhoneSurfaceRegistration = Readonly<{
  id: string;
  scene: SceneId;
  kind: PhoneSurfaceKind;
  root(): HTMLElement | null;
  coverageRoot?(): HTMLElement | null;
  /** Concrete DOM/media facts; boolean placeholders are intentionally absent. */
  presentation?(mode: PhoneSurfacePresentationReadMode): PhoneSurfacePresentation;
  /** Optional scene-local compositor preparation for a direct target hold. */
  prepareDirectEntry?(request: PhoneDirectEntryPresentationRequest): Promise<void> | void;
}>;

export type PhoneSurfaceLease = Readonly<{ dispose(): void }>;

export type PhoneDirectEntryPresentationRequest = Readonly<{
  scene: SceneId;
  sessionId: string;
  generation: number;
  signal: AbortSignal;
}>;

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
  layerPlan: PhoneTransitionLayerPlan | null;
  checkpointTrace: readonly PhoneCheckpointId[];
}>;

export type PhoneStoryProjector = Readonly<{
  attach(): void;
  preflight(snapshot: PhoneStorySnapshot): PhoneStoryProjectionPlan | null;
  apply(plan: PhoneStoryProjectionPlan): void;
  reapplyCurrent(): void;
  registerSurface(registration: PhoneSurfaceRegistration): PhoneSurfaceLease;
  /** True only when a registered scene surface is connected, visible, and covered. */
  hasPresentedSurface(scene: SceneId): boolean;
  readSurfacePresentation(scene: SceneId): PhoneSurfacePresentation | null;
  prepareDirectEntry(
    scene: SceneId,
    request: PhoneDirectEntryPresentationRequest
  ): Promise<void> | void;
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
const layerOwners = new WeakMap<HTMLElement, object>();
const rootDataKeys = [
  'phoneAuthorityId',
  'phoneAuthorityScope',
  'phoneCursor',
  'phoneRevision',
  'phonePresentationRevision',
  'phoneSession',
  'phoneTransitionGeneration',
  'phoneTransitionLeg',
  'phoneTransitionDirection',
  'phoneTransitionProgress',
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
  'phoneLayerSegment',
  'portraitCheckpoint',
  'portraitCheckpointTrace',
  'portraitEdgeScene',
  'portraitEdgeSurface'
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

function presentationFor(
  registration: PhoneSurfaceRegistration,
  surfaceRoot: HTMLElement,
  coverageRoot: HTMLElement,
  mode: PhoneSurfacePresentationReadMode
): PhoneSurfacePresentation {
  return registration.presentation?.(mode)
    ?? readPhoneSurfacePresentation(surfaceRoot, coverageRoot, mode);
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
  registration: PhoneSurfaceRegistration,
  layerPlan: PhoneTransitionLayerPlan | null
): PhoneSurfaceRole {
  if (layerPlan) {
    if (registration.id === layerPlan.receiver.surface) {
      return 'transition-receiver';
    }
    if (registration.id === layerPlan.source.surface) {
      return 'transition-source';
    }
  }
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
    return registration.scene === projection.stageScene
      ? 'fixed-current'
      : snapshot.status === 'stable' ? 'retired' : 'retained-under-stage';
  }
  return snapshot.status === 'stable' ? 'retired' : 'retained-under-stage';
}

function transitionLayerPlanFor(
  snapshot: PhoneStorySnapshot
): PhoneTransitionLayerPlan | null {
  if (snapshot.projection.commitState !== 'transition') return null;
  if (snapshot.status === 'scroll-run') {
    const run = phoneScrollRun(snapshot.run);
    return phoneTransitionLayerPlan(
      phoneSegmentPresentationTuple(run.segment),
      snapshot.scroll.direction === -1 ? -1 : 1,
      snapshot.scroll.progress
    );
  }
  if (snapshot.status !== 'transaction') return null;
  const operation = snapshot.session.operation;
  if (!operation.run) return null;
  const leg = phoneRun(operation.run).legs[operation.legIndex];
  if (!leg) return null;
  return phoneTransitionLayerPlan(
    phoneSegmentPresentationTuple(leg.segment),
    operation.direction,
    snapshot.session.progress
  );
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
  const decoratedEndpoints = new Set<HTMLElement>();
  const decoratedLayers = new Set<HTMLElement>();
  const decoratedEffects = new Set<HTMLElement>();
  let attached = false;
  let disposed = false;
  let endpoints: PhoneTransitionEndpoints | null = null;
  let checkpointTrace: readonly PhoneCheckpointId[] = [];
  let latestPlan: PhoneStoryProjectionPlan | null = null;
  let observedEffectRoot: HTMLElement | null = null;
  let effectObserver: MutationObserver | null = null;

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
  const clearLayer = (element: HTMLElement) => {
    if (layerOwners.get(element) !== token) return;
    data(element, 'phoneLayerRole', undefined);
    layerOwners.delete(element);
    decoratedLayers.delete(element);
  };
  const decorateLayer = (
    element: HTMLElement,
    role: PhonePresentationLayer
  ) => {
    layerOwners.set(element, token);
    decoratedLayers.add(element);
    data(element, 'phoneLayerRole', role);
  };
  const clearEffectDecorations = () => {
    for (const element of decoratedEffects) clearLayer(element);
    decoratedEffects.clear();
  };
  const decorateEffects = (
    routeRoot: HTMLElement,
    layerPlan: PhoneTransitionLayerPlan | null
  ) => {
    clearEffectDecorations();
    if (!layerPlan) return;
    const effectNodes = routeRoot.querySelectorAll?.('[data-r4-ink-segment]');
    if (!effectNodes) return;
    for (const node of effectNodes) {
      const effectNode = node as HTMLElement;
      if (
        canonicalPhoneEffectSegment(effectNode.dataset.r4InkSegment)
        !== layerPlan.segment
      ) {
        continue;
      }
      decorateLayer(
        effectNode,
        layerPlan.effect.role
      );
      decoratedEffects.add(effectNode);
    }
  };
  const observeEffectMounts = (routeRoot: HTMLElement | null) => {
    if (observedEffectRoot === routeRoot) return;
    effectObserver?.disconnect();
    effectObserver = null;
    observedEffectRoot = routeRoot;
    if (!routeRoot || typeof MutationObserver === 'undefined') return;
    effectObserver = new MutationObserver(() => {
      const plan = latestPlan;
      if (!plan || plan.root !== routeRoot) return;
      decorateEffects(routeRoot, plan.layerPlan);
    });
    effectObserver.observe(routeRoot, { childList: true, subtree: true });
  };
  const clearEndpointDecorations = (next: readonly HTMLElement[] = []) => {
    for (const element of decoratedEndpoints) {
      if (next.includes(element)) continue;
      decoratedEndpoints.delete(element);
      if (rootOwners.get(element) !== token) continue;
      data(element, 'phoneBoundarySession', undefined);
      data(element, 'phoneBoundaryGeneration', undefined);
      data(element, 'phoneBoundaryEndpoint', undefined);
      clearLayer(element);
      if (element.dataset.phoneSurfaceRole?.startsWith('transition-')) {
        data(element, 'phoneSurfaceRole', undefined);
      }
      if (!ownedRoots.has(element)) rootOwners.delete(element);
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
      const layerPlan = transitionLayerPlanFor(snapshot);
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
        const presentation = presentationFor(
          registration,
          surfaceRoot,
          coverageRoot,
          'preflight'
        );
        if (
          selected
          && (!presentation[0] || !presentation[1] || !presentation[2])
        ) return null;
        surfaces.push({
          registration,
          root: surfaceRoot,
          coverageRoot,
          role: roleFor(snapshot, projection, registration, layerPlan)
        });
      }
      return {
        snapshot,
        root: routeRoot,
        surfaces,
        endpoints: executionEndpoints(snapshot, endpoints),
        layerPlan,
        checkpointTrace: nextTrace(projection.checkpoint)
      };
    },
    apply(plan) {
      if (disposed) return;
      const { snapshot, root: routeRoot, surfaces, layerPlan } = plan;
      const nextEndpoints = plan.endpoints
        ? [plan.endpoints.source, plan.endpoints.receiver]
        : [];
      clearEndpointDecorations(nextEndpoints);
      const projection = snapshot.projection;
      if (routeRoot) {
        ownRoot(routeRoot);
        const execution = snapshot.status === 'transaction'
          ? snapshot.session.operation
          : null;
        const cursor = snapshot.status === 'stable'
          ? `hold:${snapshot.scene}`
          : snapshot.status === 'scroll-run'
            ? `transition:${snapshot.run}:0`
            : `transition:${execution?.run ?? 'entry'}:${execution?.legIndex ?? 0}`;
        const session = snapshot.status === 'transaction' ? snapshot.session : null;
        const edgeSurface = phoneEdgeSurfaceForScene(projection.edge);
        data(routeRoot, 'phoneAuthorityId', authorityId);
        data(routeRoot, 'phoneAuthorityScope', scope);
        data(routeRoot, 'phoneCursor', cursor);
        data(routeRoot, 'phoneRevision', String(snapshot.revision));
        data(routeRoot, 'phonePresentationRevision', String(projection.revision));
        data(routeRoot, 'phoneSession', session?.sessionId);
        data(routeRoot, 'phoneTransitionGeneration', session
          ? String(session.generation)
          : undefined);
        data(routeRoot, 'phoneTransitionLeg', session
          ? String(session.operation.legIndex)
          : undefined);
        data(routeRoot, 'phoneTransitionDirection', session
          ? String(session.operation.direction)
          : undefined);
        data(routeRoot, 'phoneTransitionProgress', session
          ? session.progress.toFixed(4)
          : undefined);
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
        data(routeRoot, 'phoneRetryableRun', snapshot.diagnostics.lastRollback?.run ?? undefined);
        data(routeRoot, 'phoneLayerSegment', layerPlan?.segment);
        data(routeRoot, 'portraitCheckpoint', projection.checkpoint);
        data(routeRoot, 'portraitCheckpointTrace', plan.checkpointTrace.join('>'));
        data(routeRoot, 'portraitEdgeScene', projection.edge);
        data(routeRoot, 'portraitEdgeSurface', edgeSurface);
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
        const layer = layerPlan && surface.registration.id === layerPlan.source.surface
          ? layerPlan.source.role
          : layerPlan && surface.registration.id === layerPlan.receiver.surface
            ? layerPlan.receiver.role
            : phoneLayerForSurfaceRole(surface.role);
        decorateLayer(surface.root, layer);
        delete surface.root.dataset.phoneBoundarySession;
        delete surface.root.dataset.phoneBoundaryGeneration;
        delete surface.root.dataset.phoneBoundaryEndpoint;
      }
      if (plan.endpoints) {
        const { source, receiver, sessionId, generation } = plan.endpoints;
        data(source, 'phoneSurfaceRole', 'transition-source');
        data(receiver, 'phoneSurfaceRole', 'transition-receiver');
        decorateLayer(
          source,
          layerPlan?.source.role ?? phoneLayerForSurfaceRole('transition-source')
        );
        decorateLayer(
          receiver,
          layerPlan?.receiver.role ?? phoneLayerForSurfaceRole('transition-receiver')
        );
        for (const [element, endpoint] of [[source, 'source'], [receiver, 'receiver']] as const) {
          data(element, 'phoneBoundarySession', sessionId);
          data(element, 'phoneBoundaryGeneration', String(generation));
          data(element, 'phoneBoundaryEndpoint', endpoint);
          rootOwners.set(element, token);
          decoratedEndpoints.add(element);
        }
      }
      if (routeRoot) decorateEffects(routeRoot, layerPlan);
      checkpointTrace = plan.checkpointTrace;
      latestPlan = plan;
      observeEffectMounts(routeRoot);
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
    hasPresentedSurface(scene) {
      const presentation = this.readSurfacePresentation(scene);
      return Boolean(
        presentation?.[0]
        && presentation[1]
        && presentation[2]
      );
    },
    readSurfacePresentation(scene) {
      const receiver = phoneScenePresentationTuple(scene)[4];
      const registration = registrations.get(receiver);
      if (!registration) return null;
      const surfaceRoot = registration.root();
      const coverageRoot = registration.coverageRoot?.() ?? surfaceRoot;
      if (!connected(surfaceRoot) || !connected(coverageRoot)) return null;
      // A direct target is proven by its manifest-scoped content contract.
      // Custom readers remain only for tests that deliberately inject facts.
      return registration.presentation?.('committed')
        ?? readPhoneScenePresentation(scene, surfaceRoot, coverageRoot, 'committed');
    },
    prepareDirectEntry(scene, request) {
      const contract = phoneScenePresentationTuple(scene);
      const receiver = contract[4];
      const registration = registrations.get(receiver);
      if (!registration) {
        throw new Error('No phone surface registration for direct entry: ' + scene);
      }
      if (!registration.prepareDirectEntry) {
        if (contract[6] === 'visual') {
          throw new Error('Visual phone surface has no direct-entry preparation: ' + scene);
        }
        return;
      }
      return registration.prepareDirectEntry(request);
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
      clearEndpointDecorations();
      effectObserver?.disconnect();
      effectObserver = null;
      observedEffectRoot = null;
      clearEffectDecorations();
      for (const element of [...decoratedLayers]) clearLayer(element);
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
