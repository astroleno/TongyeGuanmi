import { Component, Fragment, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { canonicalSceneIds } from '../story/canonical-spine';
import { createScrollSpine, locateScrollPosition, positionForScrollAnchor, scrollReadingScenes,
  type ScrollPosition, type ScrollSceneId, type ScrollSegmentId } from '../story/scroll-spine';
import { createScrollStoryRuntime, type ScrollStoryAdapter, type ScrollStoryRuntime, type ScrollStoryView } from '../runtime/scroll-story-runtime';
import { createStoryScrollSource, type StoryScrollSource } from './story-scroll-source';
import { createStoryScrollLayout, type StoryScrollLayout } from './story-scroll-layout';
import { hashForScene, sceneFromHash } from './navigation';
import { readSavedScrollAnchor, remapScrollAnchor, scrollPositionForHash } from './story-scroll-restoration';
import type { ScrollAnchor } from '../story/scroll-spine';
import type { PhoneChunkRecoveryPort } from './phone-story/runtime';
import { semanticBoolean } from '../runtime/semantic-data-attribute';
import { StoryNav, activateStaticReading, PhoneStoryFaultActions } from './StoryNav';
import { StoryLoader, type StoryLoaderMode } from './StoryLoader';
import './story-scroll.css';

export type ScrollPlatformHost = Readonly<{
  root(): HTMLElement | null;
  layer(scene: ScrollSceneId): HTMLElement | null;
  requestWindow(position: ScrollPosition): void;
  requestRender(): void;
  resourcesChanged(key: string): void;
  measure(): void;
}>;
export type StoryScrollPlatform = Readonly<{
  adapter: ScrollStoryAdapter;
  Scene: ComponentType<{ scene: ScrollSceneId }>;
  Effect?: ComponentType<{ segment: ScrollSegmentId }>;
  Overlay?: ComponentType<{ position: ScrollPosition }>;
  SurfaceScope?: ComponentType<{ children: ReactNode }>;
  dispose(): void;
}>;

class ScrollLeafBoundary extends Component<{ children: ReactNode; onError(error: Error): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function StoryScrollShell({ platform, createPlatform, initialHash, scope = 'formal', chunkRecovery }: {
  platform: 'phone' | 'desktop'; createPlatform(host: ScrollPlatformHost): StoryScrollPlatform;
  initialHash?: string; scope?: string; chunkRecovery?: PhoneChunkRecoveryPort;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const runtimeRef = useRef<ScrollStoryRuntime | null>(null);
  const sourceRef = useRef<StoryScrollSource | null>(null);
  const layoutRef = useRef<StoryScrollLayout | null>(null);
  const firstHash = useRef(initialHash ?? window.location.hash);
  const [loaderMode, setLoaderMode] = useState<StoryLoaderMode>(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced'
      : (sceneFromHash(firstHash.current) ?? 'hero') === 'hero' && !readSavedScrollAnchor(history.state?.storyScroll)
        ? 'cold-hero' : 'direct');
  const entrance = useRef({ waiting: loaderMode === 'cold-hero', progress: loaderMode === 'cold-hero' ? 0 : 1,
    startedAt: null as number | null });
  const [mounted, setMounted] = useState<ScrollPosition>(() => {
    const index = createScrollSpine({ viewportHeight: window.innerHeight, platform });
    const scene = sceneFromHash(firstHash.current) ?? 'hero';
    return locateScrollPosition(index, positionForScrollAnchor(index, { rangeId: `hold:${scene}`, progress: 0 }));
  });
  const [view, setView] = useState<ScrollStoryView>({ status: 'preparing', scene: mounted.scene, rangeId: mounted.rangeId, error: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaderHidden, setLoaderHidden] = useState(false);
  const [pendingVisible, setPendingVisible] = useState(false);
  useEffect(() => {
    setPendingVisible(false);
    if (!loaderHidden || view.status !== 'preparing') return;
    const timer = setTimeout(() => setPendingVisible(true), 250);
    return () => clearTimeout(timer);
  }, [loaderHidden, view.status]);
  const hideLoader = useCallback(() => {
    setLoaderHidden(true); entrance.current.waiting = false; sourceRef.current?.requestRender();
  }, []);
  const [direct, setDirect] = useState(false);
  const resourceRefresh = useRef(false);
  const moduleFault = useRef(false);
  const [owners] = useState(() => createPlatform({
    root: () => rootRef.current,
    layer: (scene) => rootRef.current?.querySelector<HTMLElement>(`[data-scroll-content="${scene}"]`) ?? null,
    requestWindow: setMounted,
    requestRender: () => sourceRef.current?.requestRender(),
    resourcesChanged: (key) => {
      const runtime = runtimeRef.current;
      if (!runtime || resourceRefresh.current) return;
      const position = runtime.diagnostic().desired;
      if (![position.scene, position.target, `fx:${position.segment}`].includes(key)) return;
      resourceRefresh.current = true;
      queueMicrotask(() => {
        resourceRefresh.current = false;
        if (runtimeRef.current === runtime) runtime.retry();
      });
    },
    measure: () => layoutRef.current?.measure()
  }));
  const navigateRef = useRef<(hash: string, historyMode?: 'push' | 'restore') => void>(() => undefined);
  useLayoutEffect(() => {
    if (direct) { activateStaticReading(); return; }
    const root = rootRef.current;
    if (!root) return;
    const html = document.documentElement;
    html.dataset.storyHydrated = 'true';
    html.dataset.storyScroll = platform;
    html.dataset.phoneReading = 'enabled';
    if (platform === 'phone') html.dataset.phonePreboot = 'mounted';
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    let initialized = false;
    let bootAnchor: { hash: string; saved: ScrollAnchor | null } | null = {
      hash: firstHash.current, saved: readSavedScrollAnchor(history.state?.storyScroll)
    };
    const acceptInput = () => {
      bootAnchor = null;
      entrance.current.progress = 1; entrance.current.waiting = false;
      root.dataset.scrollEntryProgress = '1';
      setLoaderMode((mode) => mode === 'cold-hero' ? 'direct' : mode);
      sourceRef.current?.requestRender();
    };
    window.addEventListener('wheel', acceptInput, { passive: true });
    window.addEventListener('touchstart', acceptInput, { passive: true });
    window.addEventListener('keydown', acceptInput);
    const layout = createStoryScrollLayout(root, (index, y, revision) => {
      if (bootAnchor) y = bootAnchor.saved ? remapScrollAnchor(index, bootAnchor.saved)
        : scrollPositionForHash(index, bootAnchor.hash, root);
      const source = sourceRef.current;
      source?.resize();
      if (initialized) {
        source?.seek(y);
        const position = locateScrollPosition(index, y);
        layout.paint(position);
        runtimeRef.current?.sample(position, revision);
      }
    });
    layoutRef.current = layout;
    layout.measure();
    root.dataset.scrollEntryProgress = String(entrance.current.progress);
    const source = createStoryScrollSource((y, now) => {
      const position = layout.locate(y);
      layout.paint(position);
      const entry = entrance.current;
      if (y > 0 || root.dataset.scrollReducedMotion === 'true') entry.progress = 1;
      if (!entry.waiting && entry.progress < 1) {
        entry.startedAt ??= now;
        // Original Hero: 900ms title cue + 220ms subtitle delay + 1200ms reveal.
        // This interruptible cold-entry exception shares the scroll RAF owner.
        entry.progress = Math.min(1, (now - entry.startedAt) / 2320);
        if (entry.progress < 1) source.requestRender();
      }
      root.dataset.scrollEntryProgress = String(entry.progress);
      runtimeRef.current?.sample(position, layout.getRevision());
      root.dataset.scrollStatus = runtimeRef.current?.getSnapshot().status ?? 'preparing';
    }, { syncTouch: platform === 'phone' });
    sourceRef.current = source;
    const initial = layout.locate(bootAnchor.saved ? remapScrollAnchor(layout.getIndex(), bootAnchor.saved)
      : scrollPositionForHash(layout.getIndex(), bootAnchor.hash, root));
    const runtime = createScrollStoryRuntime(owners.adapter, initial);
    runtimeRef.current = runtime;
    let stableSequence = 0;
    const unsubscribe = runtime.subscribe(() => {
      const next = runtime.getSnapshot(); setView(next); source.requestRender();
      if (next.status === 'ready') chunkRecovery?.markStable({ authorityId: 'continuous-scroll',
        sceneId: next.scene, commitSequence: ++stableSequence });
    });
    const navigate = (hash: string, historyMode: 'push' | 'restore' = 'push') => {
      acceptInput();
      const target = sceneFromHash(hash) ?? 'hero';
      const index = layout.getIndex();
      const saved = historyMode === 'restore' ? readSavedScrollAnchor(history.state?.storyScroll) : null;
      bootAnchor = { hash, saved };
      const y = saved ? remapScrollAnchor(index, saved) : scrollPositionForHash(index, hash, root);
      if (historyMode === 'push') {
        history.replaceState({ ...history.state, storyScroll: runtime.diagnostic().desired }, '', window.location.href);
        history.pushState({ storyScroll: layout.locate(y) }, '', hash);
      }
      source.seek(y);
      const position = layout.locate(y);
      layout.paint(position);
      runtime.sample(position, layout.getRevision(), true);
      if (historyMode === 'push') {
        const heading = layout.layer(target as ScrollSceneId)?.querySelector<HTMLElement>('h1, h2');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      }
    };
    navigateRef.current = navigate;
    const restore = () => navigate(window.location.hash, 'restore');
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(saveTimer); saveTimer = undefined;
      history.replaceState({ ...history.state, storyScroll: runtime.diagnostic().desired }, '', window.location.href);
    };
    // Immediate native scroll updates may emit scrollend on every frame.
    // Coalesce those notifications; navigation and lifecycle saves stay exact.
    const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 160); };
    const visibility = () => {
      if (document.hidden) { save(); source.suspend(); runtime.suspend(); }
      else { layout.measure(); source.resume(); runtime.resume(); }
    };
    const pageHide = () => {
      save();
      source.suspend(); runtime.suspend();
    };
    const pageShow = () => { layout.measure(); source.resume(); runtime.resume(); };
    window.addEventListener('hashchange', restore);
    window.addEventListener('scrollend', scheduleSave);
    window.addEventListener('popstate', restore);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    document.addEventListener('visibilitychange', visibility);
    initialized = true;
    source.seek(initial.scroll);
    layout.paint(initial);
    runtime.connect();
    const diagnostic = window as typeof window & { __r5ScrollStory?: unknown };
    diagnostic.__r5ScrollStory = { snapshot: runtime.diagnostic, navigate: (hash: string) => navigate(hash),
      seek: (y: number) => {
        acceptInput();
        const position = layout.locate(y);
        layout.paint(position);
        runtime.sample(position, layout.getRevision(), true);
        source.seek(y);
      }, index: layout.getIndex };
    return () => {
      clearTimeout(saveTimer);
      initialized = false; unsubscribe(); source.dispose(); runtime.dispose(); layout.dispose(); owners.dispose();
      sourceRef.current = null; runtimeRef.current = null; layoutRef.current = null;
      window.removeEventListener('hashchange', restore); window.removeEventListener('popstate', restore);
      window.removeEventListener('scrollend', scheduleSave);
      window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('wheel', acceptInput); window.removeEventListener('touchstart', acceptInput);
      window.removeEventListener('keydown', acceptInput);
      history.scrollRestoration = previousRestoration;
      delete html.dataset.storyHydrated; delete html.dataset.storyScroll;
      delete html.dataset.phonePreboot; delete html.dataset.phoneReading;
      delete diagnostic.__r5ScrollStory;
    };
  }, [owners, platform, direct, chunkRecovery]);
  const { Scene, Effect, Overlay } = owners;
  const SurfaceScope = owners.SurfaceScope ?? Fragment;
  const fail = (error: Error) => {
    runtimeRef.current?.reject(error);
    setView((current) => ({ ...current, status: 'failed', error: error.message }));
    const code = 'code' in error ? String(error.code) : '';
    if (code.includes('leaf-rejected') || /dynamically imported module|loading chunk|module script/i.test(error.message)) {
      moduleFault.current = true;
      const desired = runtimeRef.current?.diagnostic().desired ?? mounted;
      void chunkRecovery?.reportRejectedChunk({ authorityId: 'continuous-scroll', transactionId: `scroll:${desired.rangeId}`,
        moduleUrl: error.message.match(/https?:\/\/\S+\.js\S*/)?.[0] ?? 'unknown-phone-module',
        dependencies: desired.segment ? [`transition:${desired.segment}`] : [`scene:${desired.scene}`], reason: error.message });
    }
  };
  return direct ? null : (
    <SurfaceScope><main ref={rootRef} className={`story-scroll ${platform === 'phone' ? 'phone-story' : 'stage'}`}
      style={platform === 'phone' ? { background: '#040807' } : undefined}
      data-testid={platform === 'desktop' ? 'r2-stage' : undefined}
      data-scroll-platform={platform} data-phone-scope={scope} data-phone-implementation="scroll-v1"
      data-scroll-status={view.status} data-phone-reading="enabled" data-phone-interaction="enabled">
      <div className="story-scroll__flow">{canonicalSceneIds.map((scene) => (
        <div key={scene} className="story-scroll__slot" data-scroll-slot={scene}>
          <section className={`story-scroll__surface${platform === 'desktop' ? ' stage-layer' : ''}`} data-scroll-content={scene} data-stage-layer={scene}
            data-phone-plane={scene}
            data-scroll-reading={semanticBoolean(scrollReadingScenes.has(scene))} data-reading="false">
            {scrollReadingScenes.has(scene) || scene === mounted.scene || scene === mounted.target ? (
              <ScrollLeafBoundary onError={fail}><Suspense fallback={null}><Scene scene={scene} /></Suspense></ScrollLeafBoundary>
            ) : null}
          </section>
        </div>
      ))}</div>
      <div className="story-scroll__effect" data-scroll-effect data-phone-plane="effect">
        {Effect && mounted.segment ? <ScrollLeafBoundary key={mounted.segment} onError={fail}>
          <Suspense fallback={null}><Effect segment={mounted.segment} /></Suspense>
        </ScrollLeafBoundary> : null}
      </div>
      {Overlay ? <Overlay position={mounted} /> : null}
      {!loaderHidden ? <StoryLoader mode={loaderMode} ready={view.status === 'ready' || view.status === 'failed'} failed={view.status === 'failed'}
        allowSafetyExit={false} onHidden={hideLoader} /> : null}
      {loaderHidden && view.status === 'failed' ? <div className="story-scroll__cover"><div className="story-scroll__pending" role="status">当前位置未能加载</div></div>
        : pendingVisible ? <div className="story-scroll__pending" role="status">正在准备当前位置…</div> : null}
      <StoryNav currentScene={view.scene} visible menuOpen={menuOpen} showBlur={platform === 'desktop'}
        onToggleMenu={() => setMenuOpen((open) => !open)} onRead={() => setDirect(true)}
        onNavigate={(scene) => { setMenuOpen(false); navigateRef.current(hashForScene(scene)); }} />
      {view.status === 'failed' ? <PhoneStoryFaultActions reload={moduleFault.current} onRetry={() => {
        if (moduleFault.current) { if (chunkRecovery?.manualReload) chunkRecovery.manualReload(); else window.location.reload(); }
        else runtimeRef.current?.retry();
      }}
        onRead={() => setDirect(true)} /> : null}
    </main></SurfaceScope>
  );
}
