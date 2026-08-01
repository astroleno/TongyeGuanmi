import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StoryLoader } from '../StoryLoader';
import { StoryNav } from '../StoryNav';
import { hashForScene } from '../navigation';
import { phoneManifest, phoneSceneById, type PhoneSceneId,
  type PhoneSegmentId } from './manifest';
import { createPhonePresentation, runPhoneCleanupSteps, type PhoneLeafReportBinding,
  type PhoneLeafReportPort, type PhonePresentation } from './presentation';
import type {
  PhoneDependencyRef, PhoneEntryRequest, PhoneStoryEffect, PhoneStorySnapshot,
  PhoneTransactionLeg, PhoneViewportSnapshot
} from './protocol';
import { createPhoneStoryRuntime, type PhoneChunkRecoveryPort,
  type PhoneDependencyLoadResult, type PhoneStoryRuntimeEnvironment } from './runtime';
import { loadPhoneSceneModule, PhoneSceneLeaf, PhoneSceneReading } from './scenes';
import { loadPhoneTransitionModule, PhoneTransitionLeaf } from './transitions';
import './styles.css';

export type PhoneStoryShellProps = Readonly<{
  scope?: 'formal' | 'brand-lab' | 'harness';
  initialEntry?: PhoneEntryRequest;
  diagnostics?: boolean;
  chunkRecovery: PhoneChunkRecoveryPort;
}>;

type PhoneShellSnapshot = PhoneStorySnapshot<PhoneSceneId, PhoneSegmentId>;
type PhonePlaneBuffer = 'a' | 'b';
const WHEEL_GESTURE_GAP_MS = 240;
type PhoneSceneRenderSlot = Readonly<{
  sceneId: PhoneSceneId;
  buffer: PhonePlaneBuffer;
  reports: PhoneLeafReportPort;
}>;

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

function createBrowserEnvironment(scope: NonNullable<PhoneStoryShellProps['scope']>): PhoneStoryRuntimeEnvironment {
  let authoritySequence = 0;
  let layoutRevision = 0;
  let visualRevision = 0;
  const setActivationCta = (enabled: boolean) => {
    const cta = document.querySelector<HTMLButtonElement>(`.phone-story[data-phone-scope="${scope}"] [data-phone-activation]`);
    if (cta) { cta.hidden = !enabled; cta.disabled = !enabled; }
  };
  const readViewport = (): PhoneViewportSnapshot => {
    const layout = sampleLayout();
    const visual = sampleVisual();
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
        if (target.closest('[data-phone-contact-control], #contact input, #contact textarea')) {
          return 'contact-control' as const;
        }
        return target.closest('a, button, input, textarea, select, [contenteditable], [data-phone-native-corridor]')
          ? 'native-corridor' as const : 'story' as const;
      };
      let claimedTouchScroll = false;
      listen(window, 'touchstart', ((event: TouchEvent) => { claimedTouchScroll = inputTarget(event.target) === 'story'; }) as EventListener, { passive: true });
      listen(window, 'touchmove', ((event: TouchEvent) => { if (claimedTouchScroll) event.preventDefault(); }) as EventListener, { passive: false });
      let lastWheelAt = Number.NEGATIVE_INFINITY;
      listen(window, 'wheel', ((event: WheelEvent) => {
        const target = inputTarget(event.target);
        const gap = event.timeStamp - lastWheelAt;
        const fresh = gap < 0 || gap >= WHEEL_GESTURE_GAP_MS;
        lastWheelAt = event.timeStamp;
        if (target === 'story') event.preventDefault();
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
          id: number; y: number; target: ReturnType<typeof inputTarget>;
        }> | null = null;
        listen(window, 'pointerdown', ((event: PointerEvent) => {
          start = { id: event.pointerId, y: event.clientY, target: inputTarget(event.target) };
        }) as EventListener, { passive: true });
        listen(window, 'pointerup', ((event: PointerEvent) => {
          const origin = start?.id === event.pointerId ? start : null;
          start = null;
          if (origin) publish({ type: 'input', kind: 'pointer',
            delta: origin.y - event.clientY, fresh: true,
            trusted: event.isTrusted, target: origin.target });
        }) as EventListener, { passive: true });
        listen(window, 'pointercancel', (() => { start = null; }) as EventListener,
          { passive: true });
      } else {
        let start: Readonly<{
          id: number; y: number; target: ReturnType<typeof inputTarget>;
        }> | null = null;
        listen(window, 'touchstart', ((event: TouchEvent) => {
          const touch = Array.from(event.touches)[0];
          start = touch ? { id: touch.identifier, y: touch.clientY,
            target: inputTarget(event.target) } : null;
        }) as EventListener, { passive: true });
        listen(window, 'touchend', ((event: TouchEvent) => {
          const origin = start;
          const touch = origin
            ? Array.from(event.changedTouches).find(({ identifier }) => identifier === origin.id)
            : null;
          start = null;
          if (origin && touch) publish({ type: 'input', kind: 'touch',
            delta: origin.y - touch.clientY, fresh: true,
            trusted: event.isTrusted, target: origin.target });
        }) as EventListener, { passive: true });
        listen(window, 'touchcancel', (() => { start = null; }) as EventListener,
          { passive: true });
      }
      listen(window, 'keydown', ((event: KeyboardEvent) => {
        const delta = ['ArrowDown', 'PageDown', ' '].includes(event.key) ? 1
          : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
        if (delta === 0) return;
        const target = inputTarget(event.target);
        if (target === 'story') event.preventDefault();
        publish({ type: 'input', kind: 'keyboard', key: event.key, delta,
          fresh: !event.repeat, trusted: event.isTrusted, target });
      }) as EventListener);
      const publishEntry = (origin: 'hash' | 'popstate') => publish({
        type: 'entry', request: {
          pathname: window.location.pathname,
          hash: window.location.hash,
          origin
        }
      });
      listen(window, 'hashchange', (() => publishEntry('hash')) as EventListener);
      listen(window, 'popstate', (() => publishEntry('popstate')) as EventListener);
      listen(window, 'resize', (() => {
        layoutRevision += 1;
        visualRevision += 1;
        publish({ type: 'viewport', viewport: readViewport(), change: 'layout' });
      }) as EventListener);
      listen(document, 'fullscreenchange', (() => {
        layoutRevision += 1;
        visualRevision += 1;
        publish({ type: 'viewport', viewport: readViewport(), change: 'layout' });
      }) as EventListener);
      if (window.visualViewport) {
        const toolbar = () => {
          visualRevision += 1;
          publish({ type: 'viewport', viewport: readViewport(), change: 'toolbar' });
        };
        listen(window.visualViewport, 'resize', toolbar as EventListener);
        listen(window.visualViewport, 'scroll', toolbar as EventListener);
      }
      listen(window, 'scroll', (() => publish({ type: 'scroll', sample: {
        x: window.scrollX, y: window.scrollY, sampledAt: performance.now(), origin: 'native'
      } })) as EventListener, { passive: true });
      listen(document, 'visibilitychange', (() => publish({
        type: 'visibility', hidden: document.visibilityState === 'hidden'
      })) as EventListener);
      listen(window, 'pagehide', ((event: PageTransitionEvent) => publish({
        type: 'pagehide', persisted: event.persisted
      })) as EventListener);
      listen(window, 'pageshow', ((event: PageTransitionEvent) => publish({
        type: 'pageshow', persisted: event.persisted
      })) as EventListener);
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
      window.history[mode === 'push' ? 'pushState' : 'replaceState'](
        null, '', `${pathname}${hash}`
      );
    },
    observePublish: (snapshot) => {
      if (snapshot.status !== 'transaction'
        || snapshot.transaction.phase !== 'awaiting-media-activation') setActivationCta(false);
    },
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

function waitForOnline(signal: AbortSignal): Promise<void> {
  if (navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      window.removeEventListener('online', finish);
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const abort = () => {
      window.removeEventListener('online', finish);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    window.addEventListener('online', finish, { once: true });
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function loadPhoneDependencies(
  effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>,
  signal: AbortSignal
): Promise<PhoneDependencyLoadResult> {
  await waitForOnline(signal);
  const modules = effect.dependencies.filter((dependency) => (
    dependency.startsWith('scene:') || dependency.startsWith('transition:')
  ));
  try {
    await Promise.all(modules.map(async (dependency) => {
      try {
        await (dependency.startsWith('scene:')
          ? loadPhoneSceneModule(dependency.slice('scene:'.length))
          : loadPhoneTransitionModule(dependency.slice('transition:'.length)));
      } catch (error) { throw { dependency, error }; }
    }));
    return { status: 'loaded' };
  } catch (failure) {
    const rejected = failure as Readonly<{ dependency: PhoneDependencyRef; error: unknown }>;
    return {
      status: 'rejected', dependency: rejected.dependency, moduleUrl: rejected.dependency,
      reason: rejected.error instanceof Error ? rejected.error.message : String(rejected.error)
    };
  }
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
  return [binding.attempt.transactionId, binding.stageIndex, binding.leg].join('|');
}

export function PhoneStoryShell({
  scope = 'formal',
  initialEntry: requestedEntry,
  diagnostics = false,
  chunkRecovery
}: PhoneStoryShellProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const connectedRef = useRef(false);
  const reportPorts = useRef(new Map<string, PhoneLeafReportPort>());
  const retainedScenes = useRef(new Map<PhoneSceneId, PhoneSceneRenderSlot>());
  const retainedEffect = useRef<Readonly<{
    attemptId: string; segmentId: PhoneSegmentId; reports: PhoneLeafReportPort;
  }> | null>(null);
  const [owners] = useState(() => {
    const presentation = createProjector();
    const engine = createPhoneStoryRuntime({
      initialEntry: initialEntry(requestedEntry),
      environment: createBrowserEnvironment(scope),
      presentation,
      ports: { loadDependencies: loadPhoneDependencies },
      chunkRecovery
    });
    return Object.freeze({ presentation, engine });
  });
  const snapshot = useSyncExternalStore(
    owners.engine.subscribe,
    owners.engine.getSnapshot,
    owners.engine.getSnapshot
  );
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const detach = owners.presentation.attachRoot(root);
    connectedRef.current = true;
    const disconnect = owners.engine.connect();
    return () => {
      connectedRef.current = false;
      runPhoneCleanupSteps('Phone shell cleanup failed', [
        disconnect, detach,
        () => reportPorts.current.clear(), () => retainedScenes.current.clear(),
        () => { retainedEffect.current = null; }
      ]);
    };
  }, [owners]);

  const reportPort = (binding: PhoneLeafReportBinding) => {
    const key = portKey(binding);
    const cached = reportPorts.current.get(key);
    if (cached) return cached;
    const created = owners.engine.createLeafReportPort(binding);
    reportPorts.current.set(key, created);
    return created;
  };
  if (connectedRef.current && snapshot.status === 'transaction') {
    const prefix = [snapshot.transaction.attempt.transactionId,
      snapshot.transaction.stageIndex].join('|');
    for (const key of reportPorts.current.keys()) {
      if (!key.startsWith(`${prefix}|`)) reportPorts.current.delete(key);
    }
  } else {
    reportPorts.current.clear();
  }
  const roles = bufferRoles(snapshot);
  const scenes: PhoneSceneRenderSlot[] = [];
  const sceneSlot = (
    sceneId: PhoneSceneId,
    buffer: PhonePlaneBuffer,
    binding: PhoneLeafReportBinding
  ): PhoneSceneRenderSlot => {
    const retained = retainedScenes.current.get(sceneId);
    const slot = retained ? { ...retained, buffer }
      : { sceneId, buffer, reports: reportPort(binding) };
    retainedScenes.current.set(sceneId, slot);
    return slot;
  };
  let effect = retainedEffect.current;
  if (connectedRef.current && snapshot.status === 'transaction') {
    const transaction = snapshot.transaction;
    if (transaction.sourceSceneId
      && transaction.mode !== 'rollback' && transaction.mode !== 'recovery') {
      const sceneId = transaction.sourceSceneId;
      const slot = sceneSlot(sceneId, roles.source, bindingFor(
        snapshot, 'source', phoneSceneById(sceneId).surfaces
      ));
      scenes.push(slot);
    }
    const sceneId = transaction.candidateSceneId;
    const leg: PhoneTransactionLeg = transaction.mode === 'rollback' ? 'rollback' : 'target';
    const slot = sceneSlot(sceneId,
      transaction.mode === 'rollback' ? roles.source : roles.receiver,
      bindingFor(snapshot, leg, phoneSceneById(sceneId).surfaces));
    scenes.push(slot);
    const segmentId = transaction.attempt.segmentId;
    if (transaction.mode === 'segment' && segmentId && transaction.attempt.direction) {
      const segment = phoneManifest.segments.find(({ id }) => id === segmentId);
      if (segment && (effect?.attemptId !== transaction.attempt.transactionId
        || effect.segmentId !== segmentId)) effect = {
        attemptId: transaction.attempt.transactionId, segmentId,
        reports: reportPort(bindingFor(snapshot, 'effect', [
          segment[transaction.attempt.direction].effectSurface
        ]))
      };
      retainedEffect.current = effect;
    }
  } else if (connectedRef.current && snapshot.stableCommit) {
    const retained = retainedScenes.current.get(snapshot.stableCommit.sceneId);
    if (retained) scenes.push({ ...retained, buffer: roles.source });
  }
  if (snapshot.status !== 'transaction' || snapshot.transaction.mode !== 'segment') effect = retainedEffect.current = null;
  const activeSceneIds = new Set(scenes.map(({ sceneId }) => sceneId));
  for (const sceneId of retainedScenes.current.keys()) {
    if (!activeSceneIds.has(sceneId)) retainedScenes.current.delete(sceneId);
  }
  const sourceScenes = scenes.filter(({ buffer }) => buffer === roles.source);
  const receiverScenes = scenes.filter(({ buffer }) => buffer === roles.receiver);
  const stableScene = snapshot.stableCommit?.sceneId ?? null;
  const provenBoot = connectedRef.current && snapshot.status === 'stable'
    && snapshot.presentationProof.commitSequence === snapshot.stableCommit.commitSequence;
  const faulted = connectedRef.current && snapshot.status === 'faulted';
  const navigationScene = stableScene ?? 'hero';
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (sceneId: PhoneSceneId) => {
    setMenuOpen(false);
    owners.engine.requestEntry({
      pathname: window.location.pathname,
      hash: hashForScene(sceneId),
      origin: 'menu'
    });
  };
  const renderScenes = (entries: readonly PhoneSceneRenderSlot[]) => entries.map((entry) => (
    <PhoneSceneLeaf key={entry.sceneId} sceneId={entry.sceneId} reports={entry.reports} />
  ));
  return (
    <main
      ref={rootRef}
      className="phone-story"
      data-phone-scope={scope}
      data-phone-status={snapshot.status}
      data-phone-interaction={snapshot.status === 'stable' ? 'enabled' : 'disabled'}
      data-phone-revision={diagnostics ? snapshot.stateRevision : undefined}
      data-phone-authority={diagnostics ? snapshot.authorityId : undefined}
      data-phone-plane-revision={diagnostics ? snapshot.lastPlaneRevision : undefined}
      data-phone-commit-sequence={diagnostics ? snapshot.stableCommit?.commitSequence ?? 0 : undefined}
      data-phone-scene={diagnostics ? stableScene ?? undefined : undefined}
    >
      <div data-phone-loader="true">
        <StoryLoader
          mode={snapshot.originalEntry.hash === '#home' ? 'cold-hero' : 'direct'}
          ready={provenBoot}
          failed={faulted}
          allowSafetyExit={false}
        />
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
      <div className="phone-story__reading-flow" inert={snapshot.status !== 'stable'}>
        {stableScene ? <PhoneSceneReading sceneId={stableScene} /> : null}
      </div>
      <StoryNav
        currentScene={navigationScene}
        visible={snapshot.status === 'stable'}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onNavigate={navigate}
      />
      <button type="button" className="phone-story__activation" data-phone-activation="true" hidden disabled>继续播放</button>
      {faulted && !snapshot.stableCommit ? (
        <button
          type="button"
          className="phone-story__retry"
          data-phone-retry="true"
          onClick={() => owners.engine.retry()}
        >
          重试加载故事
        </button>
      ) : null}
    </main>
  );
}
