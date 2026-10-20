import { use, useCallback, useLayoutEffect, useRef } from 'react';
import type { ScrollPlatformHost, StoryScrollPlatform } from '../StoryScrollShell';
import { scrollAuthoredProgress, type ScrollSceneId, type ScrollPosition } from '../../story/scroll-spine';
import type { LayerHandle, SceneModule, SegmentTimelineHandle, StageHandle, SpineSegmentNode } from '../../story/types';
import { storyManifest } from '../../story/manifest';
import { disposeTimelineVideoDriver, prepareTimelineVideoFrame } from '../../media/timeline-video-driver';
import { loadDesktopSceneModule, loadDesktopTransitionModule } from './module-loaders';
import { RetainedFigure2Arch } from '../../stage/RetainedFigure2Arch';
import { createScrollMediaCoherence } from '../../media/scroll-media-coherence';
import { createScrollCanvasWindow, type ScrollCanvasLease } from '../../media/scroll-canvas-window';

export function createDesktopScrollPlatform(host: ScrollPlatformHost): StoryScrollPlatform {
  const inkCanvases = createScrollCanvasWindow();
  const mounted = new Map<ScrollSceneId, { module: SceneModule; handles: Map<string, HTMLElement>; ready: Promise<unknown> }>();
  const layers = new Map<string, LayerHandle>();
  const videoOwners = new WeakMap<HTMLVideoElement, number>();
  let preparationSequence = 0;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); host.requestRender(); };
  const stage: StageHandle = {
    getLayer: (scene) => layers.get(scene),
    ensureLayer(scene, role) {
      const existing = layers.get(scene);
      if (existing) { existing.role = role; return existing; }
      const layer: LayerHandle = {
        scene, role, get element() { return host.layer(scene as ScrollSceneId); },
        visibility: { mounted: true, visible: false, inert: true, opacity: 0, pointerEvents: 'none' },
        setVisibility(state) {
          layer.visibility = state;
          const element = layer.element;
          if (!element) return;
          element.style.visibility = state.visible ? 'visible' : 'hidden';
          element.style.opacity = String(state.opacity); element.style.pointerEvents = state.pointerEvents;
          element.inert = state.inert; element.setAttribute('aria-hidden', String(state.inert));
        },
        dispose() { layers.delete(scene); }
      };
      layers.set(scene, layer); return layer;
    },
    releaseLayer(scene) { layers.delete(scene); },
    snapshot: () => [...layers.values()]
  };
  function Scene({ scene }: { scene: ScrollSceneId }) {
    const module = use(loadDesktopSceneModule(scene));
    const handles = useRef(new Map<string, HTMLElement>());
    const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
      if (element) handles.current.set(name, element); else handles.current.delete(name);
      notify();
    }, []);
    useLayoutEffect(() => {
      const layer = stage.ensureLayer(scene, 'current');
      const element = layer.element;
      const ready = Promise.resolve(module.preload()).then(() => module.mount?.(layer));
      const entry = { module, handles: handles.current, ready };
      mounted.set(scene, entry);
      module.renderHold(layer.element); host.measure(); notify(); host.resourcesChanged(scene);
      void ready.then(notify, notify);
      return () => {
        if (mounted.get(scene) === entry) mounted.delete(scene);
        const videos = [...element?.querySelectorAll('video') ?? []];
        for (const video of videos) {
          disposeTimelineVideoDriver(video); video.pause();
        }
        // React's layout cleanup runs before DOM detach. A StrictMode replay
        // retains connected nodes; a later host getter may already name another
        // scene owner. Release only the captured, actually detached resources.
        queueMicrotask(() => {
          for (const video of videos) {
            if (video.isConnected) continue;
            const sources = [...video.querySelectorAll('source')];
            const loaded = Boolean(video.getAttribute('src') || sources.some(source => source.getAttribute('src'))
              || video.srcObject || video.readyState > 0);
            video.removeAttribute('src'); video.removeAttribute('poster');
            for (const source of sources) source.removeAttribute('src');
            if (video.srcObject) video.srcObject = null;
            if (loaded) video.load();
          }
        });
        stage.releaseLayer(scene); notify(); host.resourcesChanged(scene);
      };
    }, [scene, module]);
    const Component = module.Component;
    return <Component scene={scene} hidden={false} role="current" copyCueActive
      presentation={{ heroIntroMode: 'endpoint' }} registerHandle={registerHandle} />;
  }
  function Overlay({ position }: { position: ScrollPosition }) {
    const included = ['figure2-animation', 'figure2-proof'].includes(position.scene)
      || ['figure2-animation', 'figure2-proof'].includes(position.target);
    return <RetainedFigure2Arch mounted={included} visible={included}
      motion={position.scene === 'figure2-proof' ? 'fixed' : 'depth'} />;
  }
  const waitMounted = (scene: ScrollSceneId, signal: AbortSignal) => new Promise<SceneModule>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); listeners.delete(check); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new DOMException('Superseded scroll window', 'AbortError')); };
    const check = () => {
      const entry = mounted.get(scene);
      if (entry && (entry.module.scrollReadyHandles ?? []).every((name) => entry.handles.has(name))) {
        cleanup(); entry.ready.then(() => resolve(entry.module), reject);
      }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Scene ${scene} preparation timed out`)); }, 20000);
    listeners.add(check); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else check();
  });
  return {
    Scene, Overlay,
    adapter: {
      async prepare(position, _intent, signal) {
        const preparation = ++preparationSequence;
        // The authored desktop transition has at most one GL ink surface.
        // Reading keeps none; the Hero intro is a separate existing surface.
        inkCanvases.configure(position.segment ? 1 : 0);
        await inkCanvases.restoreAvailable(signal);
        if (signal.aborted) throw new DOMException('Superseded', 'AbortError');
        host.requestWindow(position);
        const sceneIds = position.segment ? [position.scene, position.target] : [position.scene];
        const modules = await Promise.all(sceneIds.map((scene) => waitMounted(scene, signal)));
        if (signal.aborted) throw new DOMException('Superseded', 'AbortError');
        let timeline: SegmentTimelineHandle | null = null;
        let inkLease: ScrollCanvasLease | null = null;
        const videos = sceneIds.flatMap((scene) => [...host.layer(scene)?.querySelectorAll('video') ?? []]);
        for (const video of videos) { videoOwners.set(video, preparation); video.addEventListener('timelinevideoframe', notify); }
        let released = false;
        let coherence: ReturnType<typeof createScrollMediaCoherence> | null = null;
        const release = () => {
          if (released) return; released = true;
          timeline?.dispose();
          inkLease?.release();
          coherence?.dispose();
          for (const video of videos) if (videoOwners.get(video) === preparation) {
            videoOwners.delete(video); video.removeEventListener('timelinevideoframe', notify); disposeTimelineVideoDriver(video); video.pause();
          }
          signal.removeEventListener('abort', release);
        };
        signal.addEventListener('abort', release, { once: true });
        try {
          await Promise.all(videos.map(async (video) => {
            video.preload = 'auto';
            if (video.readyState < 1) video.load();
            const result = await prepareTimelineVideoFrame(video, { runId: `scroll:${preparation}`, direction: 1,
              progress: 0, durationFallbackSeconds: 1, startSeconds: 0, mode: 'timeline', signal });
            if (result?.status !== 'ready') throw new Error('当前位置视频帧已失效');
          }));
          if (position.segment) {
            const segment = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === position.segment);
            if (!segment) throw new Error(`Missing canonical segment ${position.segment}`);
            const module = await loadDesktopTransitionModule(position.segment);
            timeline = await module.buildTimeline({ segment, stage,
              from: stage.ensureLayer(position.scene, 'current'), to: stage.ensureLayer(position.target, 'next'),
              direction: 1, runId: `scroll:${preparation}`, prepareToken: `scroll:prepare:${preparation}`,
              prefersReducedMotion: false, signal, sampling: 'scroll', reportMilestone: notify,
              acquireInkCanvas() {
                if (released || signal.aborted) throw new DOMException('Superseded', 'AbortError');
                if (inkLease) throw new Error('A scroll transition may own only one ink surface');
                inkLease = inkCanvases.acquire('ink', host.root()!.ownerDocument);
                return inkLease.canvas;
              } });
            if (signal.aborted) { timeline.dispose(); throw new DOMException('Superseded', 'AbortError'); }
          }
          await Promise.all(sceneIds.flatMap((scene) => [...host.layer(scene)?.querySelectorAll('img') ?? []]).map(async (image) => {
            if (typeof image.decode === 'function') await image.decode();
            if (!image.complete || !image.naturalWidth) throw new Error('当前位置的图片未能解码');
          }));
        } catch (error) { release(); throw error; }
        let proved = false;
        coherence = createScrollMediaCoherence(videos);
        const deadline = performance.now() + 20000;
        return {
          render(next, sample) {
            const frame = coherence!.render(next, sample, (pose) => {
              if (pose.scene === 'figure2-proof') {
                const arch = host.root()?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch]');
                for (const property of ['scale', 'blur', 'brightness']) arch?.style.removeProperty(`--r4-figure2-near-arch-${property}`);
              }
              if (timeline && pose.segment) { modules[0]!.renderScrollEntry?.(host.layer(pose.scene), 1); timeline.progress(scrollAuthoredProgress(pose.segment, pose.progress)); }
              else { modules[0]!.renderHold(host.layer(pose.scene)); modules[0]!.renderScrollEntry?.(host.layer(pose.scene),
                pose.scene === 'hero' ? Number(host.root()?.dataset.scrollEntryProgress ?? 1)
                  : host.root()?.dataset.scrollReducedMotion === 'true' ? 1 : pose.progress); }
            });
            if (frame) { proved = true; if (frame.progress !== next.progress) host.requestRender(); return frame; }
            if (!proved && performance.now() > deadline) throw new Error('当前位置缺少视频呈现证明');
            host.requestRender(); return null;
          },
          pause: release, dispose: release
        };
      }
    },
    dispose() {
      layers.clear();
      queueMicrotask(() => { if (!host.root()?.isConnected) inkCanvases.dispose(); });
    }
  };
}
