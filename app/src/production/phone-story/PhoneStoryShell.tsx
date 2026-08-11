import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StoryLoader } from '../StoryLoader';
import { StoryNav } from '../StoryNav';
import { hashForScene } from '../navigation';
import { PHONE_FIGURE2_ARCH_SRC, RetainedFigure2Arch } from '../../stage/PhoneRetainedFigure2Arch';
import { phoneManifest, phoneSceneById,
  type PhoneSceneId, type PhoneSegmentId } from './manifest';
import { createPhonePresentation, runPhoneCleanupSteps, type PhoneLeafReportBinding,
  type PhoneLeafReportPort, type PhonePresentation } from './presentation';
import type { PhoneAttemptKey, PhoneDependencyRef, PhoneEntryRequest, PhoneStoryEffect, PhoneStorySnapshot,
  PhoneTransactionLeg, PhoneViewportSnapshot } from './protocol';
import { createPhoneStoryRuntime, type PhoneChunkRecoveryPort, phoneReadingEdges,
  type PhoneDependencyLoadResult, type PhoneStoryRuntimeEnvironment } from './runtime';
import { createPhoneSceneTopology, loadPhoneSceneModule, PhoneSceneLeaf, PhoneSceneReading,
  phoneDiagnosticActivationSurfaces, phoneDiagnosticBlockedBy, phoneDiagnosticFailureCode,
  phoneDiagnosticMissingProofs, type PhonePlaneBuffer,
  type PhoneSceneRenderSlot } from './scenes';
import { createPhoneEffectTopology, loadPhoneTransitionModule, PhoneTransitionLeaf,
  type PhoneEffectRenderSlot } from './transitions';
import './styles.css';

export type PhoneStoryShellProps = Readonly<{
  scope?: 'formal' | 'brand-lab' | 'harness';
  initialEntry?: PhoneEntryRequest;
  diagnostics?: boolean;
  chunkRecovery: PhoneChunkRecoveryPort;
}>;

type PhoneShellSnapshot = PhoneStorySnapshot<PhoneSceneId, PhoneSegmentId>;
const WHEEL_GESTURE_GAP_MS = 240; const PHONE_IMPLEMENTATION_SIGNATURE = 'clean-v1';
const PHONE_FIGURE2_ARCH_SCENES = new Set<PhoneSceneId>(['figure2-animation', 'figure2-proof']);
type PhoneNativeHandoffRecord = Readonly<{ sceneId: PhoneSceneId; commitSequence: number; scrollY: number }>; type PhoneNativeHandoffStore = { snapshot: PhoneShellSnapshot | null; record: PhoneNativeHandoffRecord | null };
function readPhoneNativeScroll(owner: Pick<HTMLElement, 'scrollTop'> | null, windowY: number): number { const y = owner && Number.isFinite(owner.scrollTop) ? owner.scrollTop : Number.NaN; return Math.max(0, Number.isFinite(y) ? y : Number.isFinite(windowY) ? windowY : 0); } function writePhoneNativeHandoff(mirror: HTMLElement, scrollY: number): void { const value = Math.max(0, Number.isFinite(scrollY) ? scrollY : 0).toFixed(2); mirror.style.setProperty('--phone-native-scroll-y', `${value}px`); mirror.dataset.phoneNativeScrollY = value; mirror.dataset.phoneNativeHandoff = 'active'; } function clearPhoneNativeHandoff(mirror: HTMLElement | null): void { if (!mirror) return; delete mirror.dataset.phoneNativeHandoff; mirror.style.removeProperty('will-change'); }

function nativeReadingTarget(shell: HTMLElement, commit: NonNullable<PhoneShellSnapshot['stableCommit']>): number {
  const owner = document.scrollingElement ?? document.documentElement; const bottom = Math.max(0, owner.scrollHeight - owner.clientHeight);
  const cards = commit.sceneId === 'figure2-proof' && commit.landingAlias === 'cards'
    ? shell.querySelector<HTMLElement>('.phone-story__reading-flow [data-r4-proof-panel="cards"]') : null;
  return cards ? cards.offsetTop > 0 ? cards.offsetTop : Math.max(0, cards.getBoundingClientRect().top + owner.scrollTop)
    : commit.direction === 'reverse' || commit.landingAlias === 'closing' ? bottom : 0;
}

function phoneNativePrewarmTarget(sceneId: PhoneSceneId, scrollY: number, direction: 'forward' | 'reverse' | null): PhoneSceneId | null {
  const forward = direction === null || scrollY >= 2;
  if (sceneId === 'method-top') return forward ? 'figure2-animation' : 'aod-animation';
  if (sceneId === 'figure2-proof') return forward ? null : 'figure2-animation';
  if (sceneId === 'brand') return 'figure3-animation';
  if (sceneId === 'services') return forward ? 'ttg-animation' : 'figure3-animation';
  if (sceneId === 'lab') return forward ? 'ph-animation' : 'ttg-animation';
  if (sceneId === 'education') return forward ? 'crane-animation' : 'ph-animation'; if (sceneId === 'contact') return 'crane-animation'; return null;
}

type PhoneTouchPoint = Readonly<{
  identifier: number;
  clientY: number;
}>;

function createPhoneTouchArbiter() {
  type Direction = 'forward' | 'reverse';
  type Claim = {
    id: number;
    y: number;
    story: boolean;
    nativeDocument: boolean;
    startedEdges: ReturnType<typeof phoneReadingEdges>;
    direction: Direction | null;
    published: boolean;
  };
  let claim: Claim | null = null;
  const atEdge = (direction: Direction, edges: ReturnType<typeof phoneReadingEdges>) => (
    direction === 'reverse' ? edges.top : edges.bottom
  );
  return Object.freeze({
    start(
      points: readonly PhoneTouchPoint[],
      story: boolean,
      nativeDocument: boolean,
      edges: ReturnType<typeof phoneReadingEdges>
    ) {
      const point = points[0];
      claim = point
        ? {
            id: point.identifier,
            y: point.clientY,
            story,
            nativeDocument,
            startedEdges: edges,
            direction: null,
            published: false
          }
        : null;
    },
    move(points: readonly PhoneTouchPoint[]): number | null {
      const current = claim;
      const point = current
        ? points.find(({ identifier }) => identifier === current.id)
        : null;
      if (!current || !point || current.published) return null;
      const delta = current.y - point.clientY;
      if (Math.abs(delta) < 8) return null;
      const direction: Direction = delta > 0 ? 'forward' : 'reverse';
      current.direction = direction;
      const publish = current.story || (
        current.nativeDocument
        && atEdge(direction, current.startedEdges)
      );
      if (!publish) {
        return null;
      }
      current.published = true;
      return delta;
    },
    claimed(): boolean {
      return claim?.published === true;
    },
    claimedNativeDocument(): boolean {
      return claim?.published === true && claim.nativeDocument;
    },
    end(
      points: readonly PhoneTouchPoint[]
    ): boolean {
      const current = claim;
      const completed = current
        ? points.some(({ identifier }) => identifier === current.id)
        : false;
      claim = null;
      return Boolean(completed && current?.published);
    },
    cancel() {
      claim = null;
    }
  });
}

function sampleLayout() {
  const width = Math.max(0, window.innerWidth);
  const height = Math.max(0, window.innerHeight);
  return { width, height, orientation: height >= width ? 'portrait' as const : 'landscape' as const };
}

function sampleVisual() {
  const viewport = window.visualViewport;
  return {
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    scale: viewport?.scale ?? 1
  };
}

function recordDiagnosticSnapshot(snapshot: PhoneStorySnapshot): void {
  const target = window as typeof window & { __r5PhoneRuntimeLog?: PhoneStorySnapshot[] };
  if (target.__r5PhoneRuntimeLog) target.__r5PhoneRuntimeLog = [...target.__r5PhoneRuntimeLog, snapshot].slice(-64);
}

function createBrowserEnvironment(scope: NonNullable<PhoneStoryShellProps['scope']>, handoffStore: PhoneNativeHandoffStore, diagnostics: boolean): PhoneStoryRuntimeEnvironment {
  let authoritySequence = 0;
  let lastEntryKey = `${window.location.pathname}${window.location.hash}`;
  let layoutRevision = 0;
  let visualRevision = 0;
  let layout = sampleLayout();
  let visual = sampleVisual();
  const setActivationCta = (enabled: boolean) => { const cta = document.querySelector<HTMLButtonElement>(`.phone-story[data-phone-scope="${scope}"] [data-phone-activation]`); if (cta) { cta.hidden = !enabled; cta.disabled = !enabled; } };
  const readViewport = (): PhoneViewportSnapshot => {
    return {
      layout,
      visual,
      layoutRevision,
      visualRevision,
      supported: layout.width > 0 && layout.height > 0
        && visual.width > 0 && visual.height > 0
    };
  };
  return Object.freeze({
    nextAuthorityId: () => `phone-story:${scope}:${++authoritySequence}`,
    readViewport,
    activeNow: () => performance.now(),
    readReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    subscribeHost: (publish) => {
      const cleanups: Array<() => void> = [];
      const listen = (
        target: EventTarget,
        name: string,
        listener: EventListener,
        options?: AddEventListenerOptions | boolean
      ) => {
        target.addEventListener(name, listener, options);
        cleanups.push(() => target.removeEventListener(name, listener, options));
      };
      const inputTarget = (target: EventTarget | null) => {
        if (!(target instanceof Element)) return 'story' as const;
        const nativeDocument = target.closest('[data-phone-input-owner="native-document"]');
        const contactControl = target.closest('[data-phone-contact-control], #contact input, #contact textarea');
        if (nativeDocument && !nativeDocument.closest('[inert]')) return contactControl
          ? 'contact-control' as const : 'native-corridor' as const;
        if (target.closest('.phone-story[data-phone-interaction="disabled"]')) {
          return 'disabled' as const;
        }
        if (contactControl) return 'contact-control' as const;
        return target.closest([
          'a', 'button', 'input', 'textarea', 'select', '[contenteditable]',
          '[data-phone-native-corridor]', '[data-phone-input-owner="native-document"]'
        ].join(','))
          ? 'native-corridor' as const : 'story' as const;
      };
      const touchArbiter = createPhoneTouchArbiter();
      let blockedTouch = false;
      let latestNativeScrollY = window.scrollY; let lastNativeReadingEdge: 'top' | 'middle' | 'bottom' | null = null;
      const nativeReadingEdges = () => phoneReadingEdges(document.scrollingElement ?? document.documentElement);
      const freezeNativeReadingBeforePublish = (direction?: 'forward' | 'reverse') => { const shell = document.querySelector<HTMLElement>(`.phone-story[data-phone-scope="${scope}"]`); if (!shell || shell.dataset.phoneReading !== 'enabled') return false; const edges = nativeReadingEdges(); if (direction && !(direction === 'reverse' ? edges.top : edges.bottom)) return false; const sceneId = shell.dataset.phoneScene as PhoneSceneId | undefined; const snapshot = handoffStore.snapshot; const stableCommit = snapshot?.stableCommit; if (!sceneId || !stableCommit || stableCommit.sceneId !== sceneId) return false; const scrollY = readPhoneNativeScroll(document.scrollingElement ?? document.documentElement, latestNativeScrollY); handoffStore.record = { sceneId, commitSequence: stableCommit.commitSequence, scrollY }; const visualRoot = shell.querySelector<HTMLElement>(`.phone-story__viewport [data-phone-native-mirror="${sceneId}"]`); if (visualRoot) writePhoneNativeHandoff(visualRoot, scrollY); return true; };
      listen(window, 'touchstart', ((event: TouchEvent) => {
        const target = inputTarget(event.target);
        blockedTouch = target === 'disabled';
        const nativeDocument = event.target instanceof Element
          && Boolean(event.target.closest('[data-phone-input-owner="native-document"]'));
        touchArbiter.start(
          Array.from(event.touches),
          target === 'story',
          nativeDocument,
          nativeReadingEdges()
        );
      }) as EventListener, { passive: true });
      listen(window, 'touchmove', ((event: TouchEvent) => {
        if (blockedTouch) {
          event.preventDefault();
          return;
        }
        const delta = touchArbiter.move(Array.from(event.touches ?? [])); if (touchArbiter.claimed()) event.preventDefault();
        if (delta !== null) { if (touchArbiter.claimedNativeDocument()) freezeNativeReadingBeforePublish(delta > 0 ? 'forward' : 'reverse'); publish({ type: 'input', kind: 'touch', delta, fresh: true, trusted: event.isTrusted, target: 'story' }); }
      }) as EventListener, { passive: false });
      listen(window, 'touchend', ((event: TouchEvent) => {
        if (blockedTouch) {
          blockedTouch = false;
          touchArbiter.cancel();
          return;
        }
        touchArbiter.end(Array.from(event.changedTouches));
      }) as EventListener, { passive: true });
      listen(window, 'touchcancel', (() => {
        blockedTouch = false;
        touchArbiter.cancel();
      }) as EventListener, { passive: true });
      let lastWheelAt = Number.NEGATIVE_INFINITY;
      listen(window, 'wheel', ((event: WheelEvent) => {
        const target = inputTarget(event.target);
        if (target === 'disabled') {
          event.preventDefault();
          return;
        }
        const gap = event.timeStamp - lastWheelAt;
        const fresh = gap < 0 || gap >= WHEEL_GESTURE_GAP_MS;
        lastWheelAt = event.timeStamp;
        if (target === 'story') event.preventDefault();
        if (target !== 'contact-control') freezeNativeReadingBeforePublish(event.deltaY > 0 ? 'forward' : 'reverse');
        publish({ type: 'input', kind: 'wheel', delta: event.deltaY,
          fresh, trusted: event.isTrusted, target });
      }) as EventListener, { passive: false });
      const publishActivation = (event: Event) => {
        if (event.isTrusted && event.target instanceof Element
          && event.target.closest('[data-phone-activation]')) {
          publish({ type: 'activation', trusted: true });
        }
      };
      listen(window, 'click', publishActivation as EventListener);
      if ('PointerEvent' in window) {
        let start: Readonly<{
          id: number;
          y: number;
          target: Exclude<ReturnType<typeof inputTarget>, 'disabled'>;
        }> | null = null;
        listen(window, 'pointerdown', ((event: PointerEvent) => {
          if (event.pointerType === 'touch') return;
          const target = inputTarget(event.target);
          start = target === 'disabled'
            ? null
            : { id: event.pointerId, y: event.clientY, target };
        }) as EventListener, { passive: true });
        listen(window, 'pointerup', ((event: PointerEvent) => {
          if (event.pointerType === 'touch') return;
          const origin = start?.id === event.pointerId ? start : null;
          start = null;
          if (origin) { if (origin.target !== 'contact-control') freezeNativeReadingBeforePublish(origin.y - event.clientY > 0 ? 'forward' : 'reverse'); publish({ type: 'input', kind: 'pointer', delta: origin.y - event.clientY, fresh: true, trusted: event.isTrusted, target: origin.target }); }
        }) as EventListener, { passive: true });
        listen(window, 'pointercancel', (() => { start = null; }) as EventListener,
          { passive: true });
      }
      listen(window, 'keydown', ((event: KeyboardEvent) => {
        const delta = ['ArrowDown', 'PageDown', ' '].includes(event.key) ? 1
          : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
        if (delta === 0) return;
        const target = inputTarget(event.target);
        if (target === 'disabled') {
          event.preventDefault();
          return;
        }
        if (target === 'story') event.preventDefault();
        if (target !== 'contact-control') freezeNativeReadingBeforePublish(delta > 0 ? 'forward' : 'reverse');
        publish({ type: 'input', kind: 'keyboard', key: event.key, delta,
          fresh: !event.repeat, trusted: event.isTrusted, target });
      }) as EventListener);
      const publishEntry = (origin: 'hash' | 'popstate') => {
        const pathname = window.location.pathname; const hash = window.location.hash; const key = `${pathname}${hash}`;
        if (key === lastEntryKey) return;
        lastEntryKey = key; publish({ type: 'entry', request: { pathname, hash, origin } });
      };
      listen(window, 'hashchange', (() => publishEntry('hash')) as EventListener);
      listen(window, 'popstate', (() => publishEntry('popstate')) as EventListener);
      listen(window, 'resize', (() => {
        const nextLayout = sampleLayout();
        const change = nextLayout.width !== layout.width
          || nextLayout.orientation !== layout.orientation ? 'layout' : 'toolbar'; freezeNativeReadingBeforePublish();
        if (change === 'layout') {
          layout = nextLayout;
          layoutRevision += 1;
        }
        visual = sampleVisual();
        visualRevision += 1;
        publish({ type: 'viewport', viewport: readViewport(), change });
      }) as EventListener);
      listen(document, 'fullscreenchange', (() => {
        layout = sampleLayout();
        visual = sampleVisual();
        layoutRevision += 1;
        visualRevision += 1;
        publish({ type: 'viewport', viewport: readViewport(), change: 'layout' });
      }) as EventListener);
      if (window.visualViewport) {
        const toolbar = () => {
          const nextVisual = sampleVisual();
          if (nextVisual.offsetLeft === visual.offsetLeft
            && nextVisual.offsetTop === visual.offsetTop
            && nextVisual.width === visual.width
            && nextVisual.height === visual.height
            && nextVisual.scale === visual.scale) return; freezeNativeReadingBeforePublish();
          visual = nextVisual;
          visualRevision += 1;
          publish({ type: 'viewport', viewport: readViewport(), change: 'toolbar' });
        };
        listen(window.visualViewport, 'resize', toolbar as EventListener);
        listen(window.visualViewport, 'scroll', toolbar as EventListener);
      }
      listen(window, 'scroll', (() => {
        const owner = document.scrollingElement ?? document.documentElement; latestNativeScrollY = readPhoneNativeScroll(owner, window.scrollY); const edges = phoneReadingEdges(owner); const edge = edges.top ? 'top' : edges.bottom ? 'bottom' : 'middle'; if (edge === lastNativeReadingEdge) return; lastNativeReadingEdge = edge; publish({ type: 'scroll', sample: { x: owner.scrollLeft, y: latestNativeScrollY, sampledAt: performance.now(), origin: 'native' } });
      }) as EventListener, { passive: true });
      listen(document, 'visibilitychange', (() => publish({
        type: 'visibility', hidden: document.visibilityState === 'hidden'
      })) as EventListener);
      listen(window, 'pagehide', ((event: PageTransitionEvent) => publish({
        type: 'pagehide', persisted: event.persisted
      })) as EventListener);
      listen(window, 'pageshow', ((event: PageTransitionEvent) => { freezeNativeReadingBeforePublish(); publish({ type: 'pageshow', persisted: event.persisted }); }) as EventListener);
      return () => {
        for (const cleanup of cleanups.reverse()) cleanup();
        setActivationCta(false);
      };
    },
    scheduleTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelTimer: (handle) => window.clearTimeout(handle as number),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle as number),
    writeUrl: (mode, pathname, hash) => {
      window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', `${pathname}${hash}`);
      lastEntryKey = `${pathname}${hash}`;
    },
    observePublish: (snapshot) => {
      recordDiagnosticSnapshot(snapshot);
      if (snapshot.status !== 'transaction'
        || snapshot.transaction.phase !== 'awaiting-media-activation') setActivationCta(false);
    }, observeResources: (counts) => { const shell = diagnostics ? document.querySelector<HTMLElement>(`.phone-story[data-phone-scope="${scope}"]`) : null; if (shell) Object.assign(shell.dataset, { phoneResourceVideos: String(counts.videos), phoneResourceActiveDecoders: String(counts.activeDecoders), phoneResourceCanvases: String(counts.canvases), phoneResourceWebglContexts: String(counts.webglContexts) }); },
    performEffect: (effect) => {
      if (effect.type === 'show-activation-cta') return setActivationCta(effect.enabled);
      if (effect.type === 'confirm-scroll') {
        document.querySelector(effect.anchor)?.scrollIntoView({ block: 'start' });
      }
    }
  });
}

function createProjector(): PhonePresentation {
  return createPhonePresentation({
    sampleLayoutViewport: sampleLayout,
    sampleVisualViewport: sampleVisual,
    getComputedStyle: (element, pseudo) => window.getComputedStyle(element, pseudo),
    elementsFromPoint: (x, y) => (document.elementsFromPoint?.(x, y) ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
  });
}

function isExplicitAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted && (error === signal.reason || Boolean(error && typeof error === 'object'
    && 'name' in error && (error as { name?: unknown }).name === 'AbortError'));
}

async function loadPhoneDependencies(
  effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>,
  signal: AbortSignal
): Promise<PhoneDependencyLoadResult> {
  const modules = effect.dependencies.filter((dependency) => dependency.startsWith('scene:')
    || dependency.startsWith('transition:'));
  type LoadResult = Readonly<{ dependency: PhoneDependencyRef; error: unknown }> | null;
  const pending = new Map<number, Promise<LoadResult>>();
  modules.forEach((dependency, index) => pending.set(index, (async () => {
    try {
      await (dependency.startsWith('scene:')
        ? loadPhoneSceneModule(dependency.slice('scene:'.length))
        : loadPhoneTransitionModule(dependency.slice('transition:'.length)));
      return null;
    } catch (error) { return { dependency, error }; }
  })()));
  let aborted: Readonly<{ dependency: PhoneDependencyRef; error: unknown }> | null = null;
  while (pending.size > 0) {
    const winner = await Promise.race([...pending.entries()].map(async ([index, promise]) => (
      { index, result: await promise })));
    pending.delete(winner.index);
    if (!winner.result) continue;
    if (!isExplicitAbort(winner.result.error, signal)) {
      return { status: 'rejected', dependency: winner.result.dependency,
        moduleUrl: winner.result.dependency, reason: winner.result.error instanceof Error
          ? winner.result.error.message : String(winner.result.error) };
    }
    aborted ??= winner.result;
  }
  if (aborted) throw aborted.error;
  return { status: 'loaded' };
}

function initialEntry(entry?: PhoneEntryRequest): PhoneEntryRequest {
  return entry ?? {
    pathname: window.location.pathname,
    hash: window.location.hash || '#home',
    origin: 'initial'
  };
}

function bufferRoles(snapshot: PhoneShellSnapshot) {
  const committed: PhonePlaneBuffer = (snapshot.stableCommit?.commitSequence ?? 0) % 2 === 0
    ? 'a' : 'b';
  const other = committed === 'a' ? 'b' as const : 'a' as const;
  return snapshot.status === 'transaction' && snapshot.transaction.mode === 'recovery'
    ? { source: other, receiver: committed }
    : { source: committed, receiver: other };
}

function phoneFigure2ArchOwner(snapshot: PhoneShellSnapshot): 'source' | 'target' | 'shared' | undefined {
  if (snapshot.status !== 'transaction') return undefined; const sourceOwns = Boolean(snapshot.transaction.sourceSceneId && PHONE_FIGURE2_ARCH_SCENES.has(snapshot.transaction.sourceSceneId)); const targetOwns = PHONE_FIGURE2_ARCH_SCENES.has(snapshot.transaction.candidateSceneId); return sourceOwns && targetOwns ? 'shared' : sourceOwns ? 'source' : targetOwns ? 'target' : undefined;
}

function bindingFor(
  snapshot: Extract<PhoneShellSnapshot, { status: 'transaction' }>,
  leg: PhoneTransactionLeg,
  surfaceIds: readonly string[]
): PhoneLeafReportBinding {
  return {
    attempt: snapshot.transaction.attempt,
    stageIndex: snapshot.transaction.stageIndex,
    leg,
    allowedReports: snapshot.transaction.requiredPrepared
      .filter((slot) => slot.leg === leg)
      .map((slot) => slot.kind),
    allowedSurfaceIds: surfaceIds,
    planeRevision: snapshot.transaction.planeRevision
  };
}

function portKey(binding: PhoneLeafReportBinding): string {
  return binding.leg === 'effect' && binding.attempt.segmentId
    ? `effect|${binding.attempt.segmentId}`
    : [binding.attempt.transactionId, binding.stageIndex, binding.leg].join('|');
}

export function PhoneStoryShell({
  scope = 'formal',
  initialEntry: requestedEntry,
  diagnostics = false,
  chunkRecovery
}: PhoneStoryShellProps) {
  const rootRef = useRef<HTMLElement | null>(null); const reportPorts = useRef(new Map<string, PhoneLeafReportPort>()); const connectedRef = useRef(false); const lastStableCommitKeyRef = useRef<string | null>(null); const nativeHandoffStoreRef = useRef<PhoneNativeHandoffStore>({ snapshot: null, record: null });
  const [loaderHidden, setLoaderHidden] = useState(false);
  const [owners] = useState(() => {
    const presentation = createProjector();
    const engine = createPhoneStoryRuntime({
      initialEntry: initialEntry(requestedEntry),
      environment: createBrowserEnvironment(scope, nativeHandoffStoreRef.current, diagnostics),
      presentation,
      ports: {
        loadDependencies: loadPhoneDependencies,
        prewarmDependencies: loadPhoneDependencies
      },
      chunkRecovery
    });
    return Object.freeze({
      presentation, engine,
      sceneTopology: createPhoneSceneTopology<PhoneSceneId>(),
      effectTopology: createPhoneEffectTopology<PhoneSegmentId>()
    });
  });
  const snapshot = useSyncExternalStore(
    owners.engine.subscribe,
    owners.engine.getSnapshot,
    owners.engine.getSnapshot
  ); const stableScene = snapshot.stableCommit?.sceneId ?? null; nativeHandoffStoreRef.current.snapshot = snapshot;
  const stablePrewarmTarget = stableScene && snapshot.stableCommit ? phoneNativePrewarmTarget(stableScene, snapshot.scroll?.y ?? 0, snapshot.stableCommit.direction) : null; const stablePrewarmKey = stablePrewarmTarget && snapshot.stableCommit ? `${stablePrewarmTarget}:${snapshot.stableCommit.commitSequence}:${snapshot.presentationProof?.planeRevision ?? 0}` : null;
  const prewarmPortRef = useRef<Readonly<{ key: string; port: PhoneLeafReportPort }> | null>(null);
  const stablePrewarmPort = snapshot.status === 'stable' && stablePrewarmTarget && stablePrewarmKey ? (() => { if (prewarmPortRef.current?.key !== stablePrewarmKey) prewarmPortRef.current = { key: stablePrewarmKey, port: owners.engine.createPrewarmLeafReportPort(stablePrewarmTarget) }; return prewarmPortRef.current.port; })() : null;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    document.documentElement.dataset.phonePreboot = 'mounted';
    document.documentElement.dataset.storyHydrated = 'true';
    const detach = owners.presentation.attachRoot(root);
    connectedRef.current = true;
    const disconnect = owners.engine.connect();
    return () => {
      connectedRef.current = false;
      delete document.documentElement.dataset.phonePreboot; delete document.documentElement.dataset.storyHydrated;
      runPhoneCleanupSteps('Phone shell cleanup failed', [
        disconnect, detach,
        () => reportPorts.current.clear(), owners.sceneTopology.clear,
        owners.effectTopology.clear
      ]);
    };
  }, [owners]);
  const reportPort = (binding: PhoneLeafReportBinding) => {
    const key = portKey(binding); const cached = reportPorts.current.get(key);
    if (cached) { cached.rebind?.(binding); return cached; }
    const created = owners.engine.createLeafReportPort(binding); reportPorts.current.set(key, created);
    return created;
  };
  if (connectedRef.current && snapshot.status === 'transaction') {
    const prefix = [snapshot.transaction.attempt.transactionId, snapshot.transaction.stageIndex].join('|'); const effectKey = snapshot.transaction.attempt.segmentId ? `effect|${snapshot.transaction.attempt.segmentId}` : null; for (const key of reportPorts.current.keys()) if (!key.startsWith(`${prefix}|`) && key !== effectKey) reportPorts.current.delete(key);
  } else {
    for (const key of reportPorts.current.keys()) if (!key.startsWith('effect|')) reportPorts.current.delete(key);
  }
  const roles = bufferRoles(snapshot);
  const stablePlaneRevision = snapshot.presentationProof?.planeRevision ?? null;
  const stableCommitKey = snapshot.stableCommit
    ? `${snapshot.stableCommit.commitSequence}|${snapshot.stableCommit.direction}|${snapshot.stableCommit.landingAlias}|${roles.source}|${stablePlaneRevision}`
    : null;
  useLayoutEffect(() => {
    if (!connectedRef.current || snapshot.status !== 'stable' || !stableScene || stableCommitKey === null) return;
    const shell = document.querySelector<HTMLElement>(`.phone-story[data-phone-scope="${scope}"]`); const mirror = shell?.querySelector<HTMLElement>(`[data-phone-native-mirror="${stableScene}"]`) ?? null;
    const handoff = nativeHandoffStoreRef.current.record; const handoffMatches = handoff?.sceneId === stableScene && handoff.commitSequence === snapshot.stableCommit.commitSequence;
    const sameCommit = lastStableCommitKeyRef.current === stableCommitKey; if (sameCommit && mirror?.dataset.phoneNativeHandoff !== 'active' && !handoffMatches) return;
    const saved = handoffMatches ? handoff.scrollY : Number(mirror?.dataset.phoneNativeScrollY); const native = phoneSceneById(stableScene).plane === 'native';
    const target = Number.isFinite(saved) && (handoffMatches || mirror?.dataset.phoneNativeHandoff === 'active') ? saved : shell ? nativeReadingTarget(shell, snapshot.stableCommit) : 0;
    owners.presentation.commitStablePlane(roles.source);
    lastStableCommitKeyRef.current = stableCommitKey;
    clearPhoneNativeHandoff(mirror); if (nativeHandoffStoreRef.current.record) nativeHandoffStoreRef.current.record = null;
    if (!native) return;
    for (const owner of [document.scrollingElement, document.documentElement, document.body]) try { if (owner) owner.scrollTop = target; } catch { continue; } window.dispatchEvent(new Event('scroll'));
  }, [owners, roles.source, snapshot.status, stableCommitKey, stableScene, stablePlaneRevision, scope, snapshot.stableCommit]);
  const scenes: PhoneSceneRenderSlot<PhoneSceneId>[] = []; let effect: PhoneEffectRenderSlot<PhoneSegmentId> | null = null;
  if (connectedRef.current && snapshot.status === 'transaction') {
    const transaction = snapshot.transaction;
    const dependenciesLoaded = transaction.evidence.some(({ slot }) =>
      slot.kind === 'module-loaded'
      && slot.attempt.transactionId === transaction.attempt.transactionId);
    const pairClosure = transaction.mode === 'segment'
      && transaction.closure.retireAfter === 'pair-exit-or-route-dispose';
    const pair: readonly [PhoneSceneId, PhoneSceneId] | null = pairClosure && transaction.sourceSceneId ? [transaction.sourceSceneId, transaction.candidateSceneId] : null;
    owners.sceneTopology.setPair(pair);
    if (transaction.sourceSceneId
      && transaction.mode !== 'rollback' && transaction.mode !== 'recovery') {
      const sceneId = transaction.sourceSceneId;
      scenes.push(owners.sceneTopology.retain(sceneId, roles.source, () => reportPort(
        bindingFor(snapshot, 'source', phoneSceneById(sceneId).surfaces)
      )));
    }
    if (!dependenciesLoaded && stablePrewarmTarget && stablePrewarmTarget === transaction.candidateSceneId) { const binding = bindingFor(snapshot, 'target', phoneSceneById(stablePrewarmTarget).surfaces); owners.engine.promotePrewarmLeaf(binding); scenes.push(owners.sceneTopology.retain(stablePrewarmTarget, roles.receiver, () => reportPort(binding))); }
    if (dependenciesLoaded) {
      const sceneId = transaction.candidateSceneId;
      const leg: PhoneTransactionLeg = transaction.mode === 'rollback' ? 'rollback' : 'target';
      const binding = bindingFor(snapshot, leg, phoneSceneById(sceneId).surfaces);
      const promoted = transaction.mode !== 'rollback'
        && owners.engine.promotePrewarmLeaf(binding);
      const retainsPrewarm = stablePrewarmTarget === sceneId;
      scenes.push(owners.sceneTopology.retain(sceneId,
        transaction.mode === 'rollback' ? roles.source : roles.receiver,
        () => reportPort(binding), transaction.mode !== 'rollback' && !promoted && !retainsPrewarm));
    }
    const segmentId = transaction.attempt.segmentId;
    const direction = transaction.attempt.direction;
    if (dependenciesLoaded && transaction.mode === 'segment' && segmentId && direction) {
      const segment = phoneManifest.segments.find(({ id }) => id === segmentId);
      if (segment) effect = owners.effectTopology.retain(
        transaction.attempt.transactionId, segmentId, pairClosure, () => reportPort(
          bindingFor(snapshot, 'effect', [
            segment[direction].effectSurface
          ])
        )
      );
    } else effect = owners.effectTopology.clear();
  } else if (connectedRef.current && snapshot.stableCommit) {
    const stableEffect = snapshot.status === 'stable' ? owners.effectTopology.finish() : owners.effectTopology.clear(); effect = stableEffect; const retainedSegment = stableEffect ? phoneManifest.segments.find(({ id }) => id === stableEffect.segmentId) : null; owners.sceneTopology.setPair(retainedSegment ? [retainedSegment.source, retainedSegment.target] : null); scenes.push(...owners.sceneTopology.stable(snapshot.stableCommit.sceneId, roles.source, roles.receiver));
    if (snapshot.status === 'stable' && stablePrewarmTarget && stablePrewarmPort && !scenes.some(({ sceneId }) => sceneId === stablePrewarmTarget)) scenes.push(owners.sceneTopology.retain(stablePrewarmTarget, roles.receiver, () => stablePrewarmPort, true, true));
  } else effect = owners.effectTopology.clear();
  owners.sceneTopology.prune(scenes);
  const sourceScenes = scenes.filter(({ buffer }) => buffer === roles.source);
  const receiverScenes = scenes.filter(({ buffer }) => buffer === roles.receiver);
  const provenBoot = connectedRef.current && snapshot.status === 'stable'
    && snapshot.presentationProof.commitSequence === snapshot.stableCommit.commitSequence;
  const faulted = connectedRef.current && snapshot.status === 'faulted';
  const navigationScene = stableScene ?? 'hero';
  const [menuOpen, setMenuOpen] = useState(false);
  const interactionEnabled = loaderHidden && (snapshot.status === 'stable'
    || snapshot.status === 'transaction'
      && snapshot.transaction.phase === 'awaiting-leg-intent');
  const reprojectingCommittedScene = snapshot.status === 'transaction'
    && snapshot.transaction.commitIntent === 'reproject'
    && snapshot.transaction.sourceSceneId === stableScene
    && snapshot.transaction.candidateSceneId === stableScene;
  const nativeReadingEnabled = loaderHidden && stableScene !== null
    && phoneSceneById(stableScene).plane === 'native'
    && (snapshot.status === 'stable' || reprojectingCommittedScene);
  const navigationVisible = interactionEnabled && snapshot.status === 'stable'
    && stableScene !== null && stableScene !== 'hero' && stableScene !== 'pattern' && stableScene !== 'aod-animation'; const directActivationFallback = snapshot.status === 'transaction'
    && snapshot.transaction.mode !== 'segment'
    && snapshot.transaction.phase === 'awaiting-media-activation';
  const moduleFault = faulted && snapshot.status === 'faulted' && (snapshot.fault.code.includes('module') || snapshot.fault.code.includes('chunk')); const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const retainedFigure2ArchMounted = connectedRef.current
    && scenes.some(({ sceneId }) => PHONE_FIGURE2_ARCH_SCENES.has(sceneId)); const retainedFigure2ArchOwner = phoneFigure2ArchOwner(snapshot);
  const retainedFigure2ArchAttempt: PhoneAttemptKey | null = snapshot.status === 'transaction' ? snapshot.transaction.attempt : null;
  const navigate = (sceneId: PhoneSceneId) => { setMenuOpen(false);
    owners.engine.requestEntry({
      pathname: window.location.pathname,
      hash: hashForScene(sceneId),
      origin: 'menu'
    });
  };
  const renderScenes = (entries: readonly PhoneSceneRenderSlot<PhoneSceneId>[]) => entries.map((entry) => (
    <PhoneSceneLeaf key={entry.renderKey} sceneId={entry.sceneId} reports={entry.reports} />
  ));
  const reportArchReady = () => { const attempt = retainedFigure2ArchAttempt; if (attempt) owners.engine.reportPresentationPrepared({ surfaceId: 'figure2-foreground-arch', attempt, generation: attempt.transactionGeneration, token: `${attempt.transactionId}:arch` }); };
  const reportArchFailure = (error: unknown) => { const attempt = retainedFigure2ArchAttempt; if (attempt) owners.engine.reportPresentationFailure({ surfaceId: 'figure2-foreground-arch', attempt, generation: attempt.transactionGeneration, failure: { code: 'figure2-arch-decode', message: error instanceof Error ? error.message : String(error), recoverable: true } }); };
  return (
    <main ref={rootRef} className="phone-story" data-phone-scope={scope}
      data-phone-status={snapshot.status}
      data-phone-implementation={PHONE_IMPLEMENTATION_SIGNATURE}
      data-phone-interaction={interactionEnabled ? 'enabled' : 'disabled'}
      data-phone-reading={nativeReadingEnabled ? 'enabled' : 'disabled'}
      data-phone-revision={diagnostics ? snapshot.stateRevision : undefined} data-phone-reduced-motion={diagnostics ? String(reducedMotion) : undefined}
      data-phone-fault-code={diagnostics && snapshot.status === 'faulted' ? snapshot.fault.code : undefined} data-phone-last-failure={diagnostics ? phoneDiagnosticFailureCode(snapshot) : undefined}
      data-phone-blocked-by={diagnostics ? phoneDiagnosticBlockedBy(snapshot) : undefined} data-phone-activation-surfaces={diagnostics ? phoneDiagnosticActivationSurfaces(snapshot).join(',') : undefined}
      data-phone-network-hint={diagnostics ? typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online' : undefined} data-phone-missing-proof={diagnostics ? phoneDiagnosticMissingProofs(snapshot).join(',') : undefined}
      data-phone-authority={diagnostics ? snapshot.authorityId : undefined} data-phone-phase={diagnostics && snapshot.status === 'transaction' ? snapshot.transaction.phase : undefined}
      data-phone-plane-revision={diagnostics ? snapshot.lastPlaneRevision : undefined} data-phone-commit-sequence={diagnostics ? snapshot.stableCommit?.commitSequence ?? 0 : undefined}
      data-phone-scene={stableScene ?? undefined}
      data-phone-source-scene={snapshot.status === 'transaction'
        ? snapshot.transaction.sourceSceneId ?? undefined : undefined}
      data-phone-candidate-scene={snapshot.status === 'transaction'
        ? snapshot.transaction.candidateSceneId : undefined}
    >
      <div data-phone-loader="true">
        <StoryLoader mode={snapshot.originalEntry.hash === '#home' ? 'cold-hero' : 'direct'}
          ready={provenBoot} failed={faulted} allowSafetyExit={false}
          onExitStart={owners.engine.startVisibleEntrance} onHidden={() => setLoaderHidden(true)} />
      </div>
      <div className="phone-story__viewport">
        <div className="phone-story__coverage" />
        <div className="phone-story__planes">
          <div data-phone-buffer="a" data-phone-plane={roles.source === 'a' ? 'source' : 'receiver'}>
            {renderScenes(roles.source === 'a' ? sourceScenes : receiverScenes)}
          </div>
          <div data-phone-plane="effect">
            {effect ? <PhoneTransitionLeaf
              key={effect.segmentId}
              segmentId={effect.segmentId}
              reports={effect.reports}
            /> : null}
          </div>
          <div data-phone-buffer="b" data-phone-plane={roles.source === 'b' ? 'source' : 'receiver'}>
            {renderScenes(roles.source === 'b' ? sourceScenes : receiverScenes)}
          </div>
        </div>
      </div>
      {retainedFigure2ArchMounted ? <div className="phone-story__retained-figure2-arch-layer" data-phone-figure2-arch-owner={retainedFigure2ArchOwner}><RetainedFigure2Arch mounted visible ownerKey={retainedFigure2ArchAttempt?.transactionId ?? (stableScene && PHONE_FIGURE2_ARCH_SCENES.has(stableScene) ? `stable:${snapshot.stableCommit?.commitSequence ?? 0}` : null)} src={PHONE_FIGURE2_ARCH_SRC} motion="depth" onDecodeReady={reportArchReady} onDecodeFailure={reportArchFailure} /></div> : null}
      <div className="phone-story__reading-flow" inert={!nativeReadingEnabled} aria-hidden={!nativeReadingEnabled}>
        {stableScene ? <PhoneSceneReading sceneId={stableScene} /> : null}
      </div>
      <StoryNav currentScene={navigationScene} visible={navigationVisible} menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)} onNavigate={navigate} />
      {directActivationFallback ? (
        <button type="button" className="phone-story__activation" data-phone-activation="true">继续播放</button>
      ) : null}
      {faulted ? (
        <button
          type="button"
          className="phone-story__retry"
          data-phone-retry="true"
          data-phone-recovery-reload={moduleFault ? 'true' : undefined}
          onClick={() => moduleFault && chunkRecovery.manualReload ? chunkRecovery.manualReload() : owners.engine.retry()}
        >
          {moduleFault ? '重新加载最新版本' : '重试加载故事'}
        </button>
      ) : null}
    </main>
  );
}
