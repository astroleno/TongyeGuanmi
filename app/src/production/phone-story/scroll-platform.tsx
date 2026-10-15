import { use, type ReactNode } from 'react';
import { ScrollCanvasContext } from '../../media/ScrollCanvas';
import { createScrollCanvasWindow, wasWindowManagedCanvas } from '../../media/scroll-canvas-window';
import type { ScrollPlatformHost, StoryScrollPlatform } from '../StoryScrollShell';
import type { ScrollIntent, ScrollPresentedFrame } from '../../runtime/scroll-story-runtime';
import type { ScrollPosition, ScrollSceneId, ScrollSegmentId } from '../../story/scroll-spine';
import { loadPhoneSceneModule } from './scenes';
import { loadPhoneTransitionModule } from './transitions';
import { phoneDirectEntryClosure, phoneSegmentClosure,
  phoneSceneStableHold, phoneSceneById, phoneManifest, phoneRetainedFigure2ArchOwner, type PhoneInkOwnership } from './manifest';
import type { PhoneLeafMountRegistration, PhoneLeafReportPort } from './presentation';
import { PHONE_FIGURE2_ARCH_SRC } from '../../stage/PhoneRetainedFigure2Arch';
import { createScrollMediaCoherence } from '../../media/scroll-media-coherence';
import { disposeTimelineVideoDriver } from '../../media/timeline-video-driver';
import { phoneScrollChoreographyFrame } from './scroll-choreography';

type Mount = { registration: PhoneLeafMountRegistration; token: string; frames: Set<string>; prepared: Set<string>; failure: Error | null };

/** One bounded resource window; leaf reports never advance story time. */
export function createPhoneScrollPlatform(host: ScrollPlatformHost): StoryScrollPlatform {
  const canvasWindow = createScrollCanvasWindow();
  function SurfaceScope({ children }: { children: ReactNode }) {
    return <ScrollCanvasContext value={canvasWindow}>{children}</ScrollCanvasContext>;
  }
  const mounts = new Map<string, Mount>();
  const ports = new Map<string, PhoneLeafReportPort>();
  const scenePromises = new Map<ScrollSceneId, ReturnType<typeof loadPhoneSceneModule>>();
  let preparationSequence = 0;
  const changed = new Set<() => void>();
  const notify = () => { for (const listener of changed) listener(); host.requestRender(); };
  const portFor = (id: string): PhoneLeafReportPort => {
    const previous = ports.get(id);
    if (previous) return previous;
    const port: PhoneLeafReportPort = {
      registerMount(registration) {
        const mount: Mount = { registration, token: '', frames: new Set(), prepared: new Set(), failure: null };
        mounts.set(id, mount); notify(); host.measure(); host.resourcesChanged(id);
        return () => {
          if (mounts.get(id) === mount) mounts.delete(id);
          // StrictMode retains the DOM while replaying effects. Real window
          // retirement detaches it; only then retire the retained GL contexts.
          queueMicrotask(() => {
            if (registration.root.isConnected) return;
            registration.commands.dispose('closure-retired');
            for (const surface of registration.surfaces) if (surface.kind === 'canvas-webgl') {
              const canvas = surface.element as HTMLCanvasElement;
              if (wasWindowManagedCanvas(canvas)) continue;
              const gl = canvas.getContext('webgl');
              if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
            }
          });
          notify(); host.resourcesChanged(id);
        };
      },
      reportPrepared(surface, report) {
        const mount = mounts.get(id);
        if (mount && report.ready && report.token.startsWith(mount.token)) mount.prepared.add(surface);
        notify();
      },
      reportFrame(surface, report) {
        const mount = mounts.get(id);
        if (mount && mount.token === report.token && !mount.frames.has(surface)) { mount.frames.add(surface); notify(); }
      },
      reportProgress() {}, reportComplete() {},
      reportFailure(failure) {
        const mount = mounts.get(id);
        if (mount) { mount.failure = new Error(failure.message); notify(); }
      }
    };
    ports.set(id, port);
    return port;
  };
  const waitFor = <T,>(read: () => T | undefined, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
    const finish = (error?: unknown, value?: T) => {
      clearTimeout(timeout); changed.delete(check); signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve(value!);
    };
    const check = () => { try { const value = read(); if (value !== undefined) finish(undefined, value); } catch (error) { finish(error); } };
    const aborted = () => finish(new DOMException('Superseded scroll window', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('当前位置的画面准备超时')), 20000);
    changed.add(check); signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else check();
  });
  function Scene({ scene }: { scene: ScrollSceneId }) {
    let promise = scenePromises.get(scene);
    if (!promise) { promise = loadPhoneSceneModule(scene); scenePromises.set(scene, promise); }
    const Component = use(promise).default;
    return <Component reports={portFor(scene)} />;
  }
  function Effect({ segment }: { segment: ScrollSegmentId }) {
    const Component = use(loadPhoneTransitionModule(segment)).default;
    return <Component reports={portFor(`fx:${segment}`)} />;
  }
  function Overlay({ position }: { position: ScrollPosition }) {
    const owner = position.segment ? phoneRetainedFigure2ArchOwner(position.segment, 'forward')
      : ['figure2-animation', 'figure2-proof'].includes(position.scene) ? 'shared' : 'none';
    return owner === 'none' ? null : <div className="phone-story__retained-figure2-arch-layer" data-scroll-arch data-phone-figure2-arch-owner={owner}>
      <img className="stage-proof-retained-arch" data-stage-retained-figure2-arch="true" data-visible="true"
        data-figure2-arch-motion={position.scene === 'figure2-proof' ? 'fixed' : 'depth'}
        src={PHONE_FIGURE2_ARCH_SRC} alt="" aria-hidden="true" onLoad={({ currentTarget: image }) => {
          // Reading leaves are already mounted: preparation can finish before
          // React inserts this overlay. Prove that late image too.
          void image.decode().then(() => {
            if (image.isConnected) { image.dataset.scrollDecoded = 'true'; notify(); }
          }, notify);
        }} />
    </div>;
  }
  return {
    Scene, Effect, Overlay, SurfaceScope,
    adapter: {
      async prepare(position, _intent, signal) {
        const preparation = ++preparationSequence;
        const closure = position.segment ? phoneSegmentClosure(position.segment, 'forward') : phoneDirectEntryClosure(position.scene);
        canvasWindow.configure(closure.resourceBudget.webglContexts);
        await canvasWindow.restoreAvailable(signal);
        if (signal.aborted) throw new DOMException('Superseded', 'AbortError');
        host.requestWindow(position);
        const ids = position.kind === 'segment' ? [position.scene, position.target, `fx:${position.segment}`] : [position.scene];
        await Promise.all(ids.map((id) => waitFor(() => mounts.get(id), signal)));
        if (signal.aborted) throw new DOMException('Superseded', 'AbortError');
        // StrictMode may replace a registration synchronously before the await resumes.
        const records = ids.map((id) => {
          const record = mounts.get(id);
          if (!record) throw new Error(`Scene ${id} was detached during preparation`);
          return record;
        });
        const surfaces = records.flatMap(({ registration }) => registration.surfaces);
        const videos = surfaces.filter(({ kind }) => kind === 'video').map(({ element }) => element as HTMLVideoElement);
        const canvases = surfaces.filter(({ kind }) => kind.startsWith('canvas'));
        const idleCanvases = canvasWindow.snapshot().idle;
        const actual = { videos: videos.length, activeDecoders: videos.length, canvases: canvases.length + idleCanvases,
          webglContexts: canvases.filter(({ kind }) => kind === 'canvas-webgl').length + idleCanvases };
        for (const key of ['videos', 'activeDecoders', 'canvases', 'webglContexts'] as const) {
          if (actual[key] > closure.resourceBudget[key]) throw new Error(`Scroll resource budget exceeded: ${key} ${actual[key]}/${closure.resourceBudget[key]}`);
        }
        const runToken = `scroll:${preparation}`;
        records.forEach((record, i) => {
          record.failure = null; record.frames.clear(); record.prepared.clear(); record.token = `${runToken}:${ids[i]}`;
          const token = record.token; const reports = portFor(ids[i]!);
          const scopedReports: PhoneLeafReportPort = { ...reports,
            reportFailure: (failure) => { if (record.token === token && !signal.aborted) reports.reportFailure(failure); }
          };
          record.registration.commands.rebind({ reports: scopedReports, frameToken: record.token,
            transactionId: runToken, segmentId: position.segment, stageIndex: 0, direction: 'forward', sampling: 'scroll',
            leg: i === 0 ? 'source' : i === 1 ? 'target' : 'effect' });
        });
        const checkFailure = () => {
          const failure = records.find((record) => record.failure)?.failure;
          if (failure) throw failure;
        };
        let released = false;
        let coherence: ReturnType<typeof createScrollMediaCoherence> | null = null;
        const release = () => {
          if (released) return; released = true;
          coherence?.dispose();
          for (const record of records) if (record.token.startsWith(`${runToken}:`)) {
            record.registration.commands.pause('superseded');
            for (const surface of record.registration.surfaces) if (surface.kind === 'video') disposeTimelineVideoDriver(surface.element as HTMLVideoElement);
          }
          for (const video of videos) video.removeEventListener('timelinevideoframe', notify);
          signal.removeEventListener('abort', release);
        };
        signal.addEventListener('abort', release, { once: true });
        for (const video of videos) video.addEventListener('timelinevideoframe', notify);
        try {
          const images = new Set(records.flatMap(({ registration }) => [...registration.root.querySelectorAll('img')]));
          const arch = host.root()?.querySelector<HTMLImageElement>('[data-scroll-arch] img');
          if (arch) images.add(arch);
          await Promise.all([...images].map(async (image) => {
            if (typeof image.decode === 'function') await image.decode();
            if (!image.complete || !image.naturalWidth) throw new Error('当前位置的图片未能解码');
            if (image === arch) image.dataset.scrollDecoded = 'true';
          }));
          if (signal.aborted) throw new DOMException('Superseded', 'AbortError');
          if (position.segment === 'figure2-distance-expand') {
            await waitFor(() => { checkFailure(); return records[2]?.prepared.has('fx:figure2-distance-expand') ? true : undefined; }, signal);
          }
          const activations = records.flatMap((record) => {
            const surfaceIds = record.registration.surfaces.filter(({ kind }) => kind === 'video').map(({ id }) => id);
            if (!surfaceIds.length) return [];
            const invocation = record.registration.commands.activate({ invocationId: runToken, runToken,
              surfaceIds, credit: 'direct-muted-autoplay', direction: 'forward', stageIndex: 0 });
            checkFailure();
            if (!invocation.invoked || invocation.settlements.some(({ status }) => status === 'rejected')) throw new Error('当前位置的视频激活失败');
            return invocation.settlements.flatMap((settlement) => settlement.status === 'pending' ? [settlement.settled] : []);
          });
          await Promise.all(activations);
          if (signal.aborted) throw new DOMException('Superseded', 'AbortError');
          checkFailure();
          for (const record of records) record.registration.commands.setMediaPhase?.({
            phase: 'playing', runToken, direction: 'forward', stageIndex: 0
          });
        } catch (error) { release(); throw error; }
        const started = performance.now();
        coherence = createScrollMediaCoherence(videos);
        let lastPresented: ScrollPresentedFrame | null = null;
        const mask = (layer: HTMLElement | null, opacity: number, foreground: boolean, ownership: PhoneInkOwnership | null, reveal: boolean) => {
          if (!layer) return;
          layer.style.opacity = String(opacity); layer.style.zIndex = foreground ? '30' : '10';
          // The depth atlas directly owns these properties; a generic mask
          // assignment would erase its freshly committed reveal/conceal pair.
          if (layer.hasAttribute('data-r4-depth-mask-run')) return;
          layer.style.clipPath = (reveal ? ownership?.revealClip : ownership?.concealClip) ?? 'none';
          layer.style.maskImage = (reveal ? ownership?.revealMask : ownership?.concealMask) ?? 'none';
          layer.style.maskSize = ownership?.maskSize ?? 'auto'; layer.style.maskRepeat = ownership?.maskRepeat ?? 'no-repeat';
          layer.style.maskMode = ownership?.maskMode ?? 'match-source';
        };
        const paint = (next: ScrollPosition) => {
            const root = host.root();
            if (root) root.style.backgroundColor = phoneSceneById(next.scene).edgeSurface;
            records[0]!.registration.commands.renderEntry?.(next.scene === 'hero' && next.kind === 'hold'
              ? Number(root?.dataset.scrollEntryProgress ?? 1)
              : next.kind === 'hold' && root?.dataset.scrollReducedMotion !== 'true' ? next.progress : 1);
            if (next.segment) {
              const pose = phoneScrollChoreographyFrame(next.segment, next.progress);
              records[0]!.registration.commands.render(next.scene === 'figure2-proof' ? 0 : pose.sourceProgress);
              records[1]!.registration.commands.render(next.target === 'figure2-proof' ? 0 : pose.targetProgress);
              const result = records[2]!.registration.commands.render(pose.effectProgress);
              const ownership = result?.ownership ?? null;
              mask(host.layer(next.scene), pose.sourceOpacity, pose.foregroundOwner === 'source', ownership, false);
              mask(host.layer(next.target), pose.targetOpacity, pose.foregroundOwner === 'target', ownership, true);
              const effect = root?.querySelector<HTMLElement>('[data-scroll-effect]');
              if (effect) effect.style.zIndex = phoneManifest.segments.find(({ id }) => id === next.segment)?.effectPlacement === 'above-both' ? '40' : '20';
              const arch = root?.querySelector<HTMLElement>('[data-scroll-arch]');
              if (arch) {
                const owner = phoneRetainedFigure2ArchOwner(next.segment, 'forward');
                mask(arch, owner === 'source' ? pose.sourceOpacity : owner === 'target' ? pose.targetOpacity : 1, true, owner === 'shared' ? null : ownership, owner === 'target');
                arch.style.zIndex = '35';
              }
            } else records[0]!.registration.commands.render(phoneSceneStableHold(next.scene));
            root?.style.setProperty('--phone-story-progress', String(next.progress));
        };
        return {
          render(next: ScrollPosition, sample: ScrollIntent) {
            checkFailure();
            const frame = coherence!.render(next, sample, paint);
            const root = host.root();
            const ready = frame && canvases.every(({ id, element }) => id === 'hero-intro-ink' || records.some((record) => record.frames.has(id))
                || id.startsWith('fx:') && element.dataset.r4InkRendererActive === 'true')
              && !root?.querySelector<HTMLImageElement>('[data-scroll-arch] img:not([data-scroll-decoded])');
            if (ready) { lastPresented = frame; if (frame.progress !== next.progress) host.requestRender(); }
            else {
              if (performance.now() - started > 20000 && !lastPresented) throw new Error('当前位置缺少视频或合成帧证明');
              host.requestRender();
            }
            return lastPresented?.epoch === sample.epoch ? lastPresented : null;
          },
          pause: release, dispose: release
        };
      }
    },
    dispose() {
      for (const mount of mounts.values()) mount.registration.commands.pause('outside-closure');
      queueMicrotask(() => { if (!host.root()?.isConnected) canvasWindow.dispose(); });
    }
  };
}
