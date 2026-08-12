import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { AlphaVideoSources } from '../../../media/alpha-video-sources';
import { disposeTimelineVideoDriver, driveTimelineVideo } from '../../../media/timeline-video-driver';
import { primePhoneNativeVideo } from '../../../media/phone-native-video-prime';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceFailure,
  type PhonePackedAlphaSurfaceMode
} from '../../../media/phone-packed-alpha-surface';
import { phoneMediaUrlFor } from '../../../media/phone-media';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import type { PhoneLeafDisposeReason } from '../../../production/phone-story/protocol';
import {
  CRANE_ARCH_SRC,
  CRANE_CLOUD_BACK_SRC,
  CRANE_CLOUD_FRONT_SECOND_SRC,
  CRANE_CLOUD_FRONT_SRC,
  CRANE_FIGURE_HEVC_ALPHA_SRC,
  CRANE_FIGURE_MEDIA_KEY,
  CRANE_FIGURE_VIDEO_SRC,
  CRANE_FLOCK_HEVC_ALPHA_SRC,
  CRANE_FLOCK_MEDIA_KEY,
  CRANE_FLOCK_VIDEO_SRC,
  CRANE_PAPER_SRC,
  CRANE_VIDEO_END_SECONDS
} from '..';
import {
  phoneCraneMediaProgressForTimeline,
  phoneCranePresentedTimelineProgress,
  phoneCraneVideos,
} from './PhoneCrane.autoplay';
import {
  renderPhoneCranePresentation,
  type PhoneCranePlaybackDirection
} from './PhoneCrane.motion';
import './PhoneCrane.css';

const PHONE_CRANE_FIGURE_PACKED = phoneMediaUrlFor(
  'crane-figure-packed', 'crane-animation'
);
const PHONE_CRANE_FLOCK_PACKED = phoneMediaUrlFor(
  'crane-flock-packed', 'crane-animation'
);

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="crane-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="crane-animation"]') ?? null;
}

export {
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  phoneCranePresentationProgress,
  renderPhoneCranePresentation
} from './PhoneCrane.motion';

export function parkPhoneCraneMedia(root: HTMLElement | null | undefined): void {
  const section = rootFor(root);
  for (const video of phoneCraneVideos(section)) {
    if (!video) continue;
    disposeTimelineVideoDriver(video);
    video.pause();
  }
}

/** Stable authored fallback; it cannot satisfy either Canvas proof slot. */
export function applyPhoneCraneMediaFallback(
  root: HTMLElement | null | undefined
): void {
  const section = rootFor(root);
  renderPhoneCranePresentation(section, 0);
  for (const video of phoneCraneVideos(section)) {
    if (!video) continue;
    disposeTimelineVideoDriver(video);
    video.pause();
    video.setAttribute('data-phone-crane-media', 'fallback');
  }
  section?.setAttribute('data-phone-crane-media', 'fallback');
}

export type PhoneCraneProps = Readonly<{ reports: PhoneLeafReportPort }>;

/**
 * Genuine Crane leaf. Runtime owns progress and activation; the leaf owns two
 * distinct decoder/Canvas pairs and proves each only after a physical draw
 * from its currently active packed-alpha generation.
 */
export function PhoneCrane({ reports }: PhoneCraneProps) {
  const mountRootRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const figureVideoRef = useRef<HTMLVideoElement | null>(null);
  const flockVideoRef = useRef<HTMLVideoElement | null>(null);
  const figureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const flockCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfacesRef = useRef<readonly [
    PhonePackedAlphaSurface,
    PhonePackedAlphaSurface
  ] | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const surfaceGenerationsRef = useRef<[number, number]>([0, 0]);
  const admissionGenerationsRef = useRef<[number, number]>([0, 0]);
  const readyMaskRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const progressRef = useRef(0);
  const presentedProgressRef = useRef(0);
  const directionRef = useRef<PhoneCranePlaybackDirection>(1);
  const mediaRunTokenRef = useRef<string | null>(null);
  const mediaPhaseRef = useRef<'primed' | 'playing' | 'held'>('primed');
  const disposedRef = useRef(false);

  const updatePairPresentation = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const ready = readyMaskRef.current === 3
      && admissionGenerationsRef.current.every((generation) => generation > 0);
    root.toggleAttribute('data-phone-crane-pair-ready', ready);
  }, []);

  const reportLane = useCallback((
    binding: PhoneLeafGenerationBinding,
    index: 0 | 1,
    generation: number
  ) => {
    const layer = index === 0 ? 'figure' : 'flock';
    const surfaceId = index === 0 ? 'crane-figure-canvas' : 'crane-flock-canvas';
    binding.reports.reportFrame(surfaceId, {
      kind: 'frame', token: binding.frameToken, presented: true,
      frameId: `crane-${layer}-packed:${generation}:${++frameSequenceRef.current}`,
      detail: { compositorDrawn: true, generation, layer, progress: progressRef.current }
    });
  }, []);

  const reportFailure = useCallback((
    index: 0 | 1,
    layer: 'figure' | 'flock',
    failure: PhonePackedAlphaSurfaceFailure
  ) => {
    const binding = bindingRef.current;
    if (!binding || disposedRef.current
      || failure.generation < surfaceGenerationsRef.current[index]) return;
    surfaceGenerationsRef.current[index] = failure.generation;
    admissionGenerationsRef.current[index] = 0;
    readyMaskRef.current &= ~(1 << index);
    updatePairPresentation();
    binding.reports.reportFailure({
      code: `crane-${layer}-${failure.code}`,
      message: failure.message,
      recoverable: true,
      detail: { generation: failure.generation, layer }
    });
  }, [updatePairPresentation]);

  const syncPresentedClock = useCallback(() => {
    const mediaProgress = [figureCanvasRef.current, flockCanvasRef.current].map(
      (canvas, index) => Number(canvas?.dataset.packedAlphaGeneration)
        === surfaceGenerationsRef.current[index]
        && Number.isFinite(Number(canvas?.dataset.packedAlphaMediaTime))
        ? Math.min(1, Math.max(0,
          Number(canvas?.dataset.packedAlphaMediaTime) / CRANE_VIDEO_END_SECONDS))
        : null
    );
    const presented = phoneCranePresentedTimelineProgress(
      progressRef.current, directionRef.current,
      mediaProgress[0] ?? null, mediaProgress[1] ?? null,
      presentedProgressRef.current
    );
    presentedProgressRef.current = presented;
    renderPhoneCranePresentation(rootRef.current, presented, directionRef.current);
  }, []);

  const render = useCallback((rawProgress: number) => {
    const progress = Math.min(1, Math.max(0, rawProgress));
    progressRef.current = progress;
    const videos = [figureVideoRef.current, flockVideoRef.current] as const;
    if (mediaPhaseRef.current === 'playing' && videos.every(Boolean)) {
      const media = phoneCraneMediaProgressForTimeline(progress);
      const runId = mediaRunTokenRef.current ?? bindingRef.current?.frameToken ?? 'crane';
      [media.figure, media.flock].forEach((laneProgress, index) => {
        driveTimelineVideo(videos[index]!, {
          runId: `${runId}:${index}`,
          direction: directionRef.current,
          progress: laneProgress,
          durationFallbackSeconds: CRANE_VIDEO_END_SECONDS,
          startSeconds: 0,
          endSeconds: CRANE_VIDEO_END_SECONDS,
          mode: 'timeline',
          allowPlaybackNudge: false
        });
      });
      syncPresentedClock();
    } else {
      presentedProgressRef.current = progress;
      renderPhoneCranePresentation(rootRef.current, progress, directionRef.current);
    }
    for (const [index, surface] of (surfacesRef.current ?? []).entries()) {
      if ((admissionGenerationsRef.current[index] ?? 0) > 0) surface.probe();
    }
  }, [syncPresentedClock]);

  const activateSurfaces = useCallback((mode: PhonePackedAlphaSurfaceMode) => {
    const surfaces = surfacesRef.current;
    if (!surfaces || disposedRef.current) return [0, 0] as const;
    const generations = surfaces.map((surface) => surface.activate(mode)) as [number, number];
    surfaceGenerationsRef.current = generations;
    return generations;
  }, []);

  const verifyTerminalFrames = useCallback(() => {
    const binding = bindingRef.current;
    if (!binding || binding.segmentId !== 'crane-contact'
      || binding.direction !== 'forward') return true;
    const terminal = [figureCanvasRef.current, flockCanvasRef.current].every((canvas, index) => (
      Number(canvas?.dataset.packedAlphaGeneration) === surfaceGenerationsRef.current[index]
      && Number(canvas?.dataset.packedAlphaMediaTime) >= CRANE_VIDEO_END_SECONDS - .08
    ));
    if (terminal) return true;
    if (rootRef.current?.dataset.phoneCraneMedia !== 'terminal-missing') {
      rootRef.current?.setAttribute('data-phone-crane-media', 'terminal-missing');
      binding.reports.reportFailure({
        code: 'crane-terminal-frame-missing',
        message: 'Crane terminal Canvas frames are missing',
        recoverable: true,
        detail: { runToken: mediaRunTokenRef.current ?? binding.frameToken }
      });
    }
    return false;
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      mediaRunTokenRef.current = null;
      mediaPhaseRef.current = 'primed';
      directionRef.current = binding.direction === 'reverse' ? -1 : 1;
      progressRef.current = directionRef.current === -1 ? 1 : 0;
      presentedProgressRef.current = progressRef.current;
      renderPhoneCranePresentation(rootRef.current, progressRef.current, directionRef.current);
      frameSequenceRef.current = 0;
      const reproof = binding.segmentId === null && readyMaskRef.current === 3;
      admissionGenerationsRef.current = reproof ? [...surfaceGenerationsRef.current] : [0, 0];
      if (reproof) { reportLane(binding, 0, surfaceGenerationsRef.current[0]); reportLane(binding, 1, surfaceGenerationsRef.current[1]); }
    },
    activate(command): PhoneActivationInvocation {
      const expected = ['crane-figure-video', 'crane-flock-video'];
      const videos = [figureVideoRef.current, flockVideoRef.current] as const;
      if (disposedRef.current || !bindingRef.current || videos.some((video) => !video)
        || command.surfaceIds.length !== expected.length
        || command.surfaceIds.some((surfaceId, index) => surfaceId !== expected[index])) {
        return {
          invocationId: command.invocationId,
          surfaceIds: command.surfaceIds,
          invoked: false,
          settlements: []
        };
      }
      const direction = command.direction === 'reverse' ? -1 : 1;
      directionRef.current = direction;
      const runToken = command.runToken ?? command.invocationId;
      mediaRunTokenRef.current = runToken;
      mediaPhaseRef.current = 'primed';
      const binding = bindingRef.current;
      const endpoint = direction === -1;
      const canvases = [figureCanvasRef.current, flockCanvasRef.current] as const;
      const reusable = readyMaskRef.current === 3 && canvases.every((canvas, index) => {
        const generation = surfaceGenerationsRef.current[index] ?? 0;
        const mediaTime = Number(canvas?.dataset.packedAlphaMediaTime);
        return generation > 0
          && Number(canvas?.dataset.packedAlphaGeneration) === generation
          && mediaTime >= (endpoint ? CRANE_VIDEO_END_SECONDS - .08 : 0)
          && mediaTime <= (endpoint ? Infinity : .04);
      });
      let generations: readonly [number, number];
      if (reusable) {
        generations = surfaceGenerationsRef.current;
        for (const surface of surfacesRef.current ?? []) {
          surface.setMode?.(endpoint ? 'endpoint' : 'initial', true);
        }
        admissionGenerationsRef.current = [...generations];
        updatePairPresentation();
        reportLane(binding, 0, generations[0]);
        reportLane(binding, 1, generations[1]);
      } else {
        admissionGenerationsRef.current = [0, 0];
        readyMaskRef.current = 0;
        updatePairPresentation();
        generations = activateSurfaces(endpoint ? 'endpoint' : 'initial');
        admissionGenerationsRef.current = [...generations];
      }
      progressRef.current = endpoint ? 1 : 0;
      presentedProgressRef.current = progressRef.current;
      renderPhoneCranePresentation(rootRef.current, progressRef.current, direction);
      for (const video of videos) {
        disposeTimelineVideoDriver(video!);
        video!.pause();
        try { video!.currentTime = endpoint ? CRANE_VIDEO_END_SECONDS : 0; } catch {
          // The initial compositor callback will arrive after loadeddata.
        }
      }
      const settled = !reusable && generations.every((generation) => generation > 0)
        ? videos.map((video, index) => primePhoneNativeVideo(video!, {
          isCurrent: () => !disposedRef.current
            && mediaRunTokenRef.current === runToken
            && bindingRef.current === binding,
          phase: () => mediaPhaseRef.current,
          onRejected: (error: unknown) => {
            if (disposedRef.current || bindingRef.current !== binding) return;
            const layer = index === 0 ? 'figure' : 'flock';
            binding.reports.reportFailure({
              code: `crane-${layer}-activation-playback-rejected`,
              message: error instanceof Error ? error.message : String(error),
              recoverable: true,
              detail: { runToken, layer }
            });
          }
        }))
        : [];
      return {
        invocationId: command.invocationId,
        surfaceIds: expected,
        invoked: generations.every((generation) => generation > 0),
        settlements: reusable
          ? expected.map((surfaceId) => ({ surfaceId, status: 'fulfilled' as const }))
          : generations.every((generation) => generation > 0)
          ? expected.map((surfaceId, index) => ({
            surfaceId, status: 'pending' as const, settled: settled[index]!
          }))
          : []
      };
    },
    setMediaPhase(command) {
      const binding = bindingRef.current;
      const videos = [figureVideoRef.current, flockVideoRef.current] as const;
      if (!binding || videos.some((video) => !video) || disposedRef.current
        || (mediaRunTokenRef.current !== null
          && mediaRunTokenRef.current !== command.runToken)) return;
      mediaRunTokenRef.current = command.runToken;
      directionRef.current = command.direction === 'reverse' ? -1 : 1;
      if (command.phase === 'primed') {
        mediaPhaseRef.current = 'primed';
        for (const video of videos) video?.pause();
        return;
      }
      if (command.phase === 'held') {
        mediaPhaseRef.current = 'held';
        const endpoint = command.endpoint ?? (command.direction === 'reverse' ? 0 : 1);
        if (endpoint === 1 && command.direction !== 'reverse') verifyTerminalFrames();
        for (const video of videos) {
          video?.pause();
          try { if (video) video.currentTime = endpoint * CRANE_VIDEO_END_SECONDS; } catch { /* retry */ }
        }
        return;
      }
      mediaPhaseRef.current = 'playing';
      for (const surface of surfacesRef.current ?? []) surface.setMode?.('forward', true);
      for (const video of videos) video?.pause();
      render(progressRef.current);
    },
    render,
    settle(endpoint) {
      directionRef.current = endpoint === 0 ? 1 : -1;
      progressRef.current = endpoint;
      presentedProgressRef.current = endpoint;
      renderPhoneCranePresentation(rootRef.current, endpoint, directionRef.current);
      const videos = [figureVideoRef.current, flockVideoRef.current] as const;
      if (endpoint === 1) verifyTerminalFrames();
      for (const video of videos) {
        video?.pause();
        try {
          if (video && endpoint === 0) video.currentTime = 0;
        } catch { /* retry on metadata */ }
      }
    },
    pause() {
      mediaRunTokenRef.current = null;
      mediaPhaseRef.current = 'held';
      admissionGenerationsRef.current = [0, 0];
      parkPhoneCraneMedia(rootRef.current);
    },
    dispose(reason: PhoneLeafDisposeReason) {
      if (disposedRef.current) return;
      disposedRef.current = true;
      mediaRunTokenRef.current = null;
      admissionGenerationsRef.current = [0, 0];
      surfaceGenerationsRef.current = [0, 0];
      updatePairPresentation();
      if (['closure-retired', 'faulted', 'route-dispose'].includes(reason)) for (const surface of surfacesRef.current ?? []) surface.dispose('terminal');
      else for (const surface of surfacesRef.current ?? []) surface.dispose('reactivatable');
      surfacesRef.current = null;
      parkPhoneCraneMedia(rootRef.current);
      bindingRef.current = null;
    }
  }), [activateSurfaces, render, reportLane, updatePairPresentation, verifyTerminalFrames]);

  useLayoutEffect(() => {
    const mountRoot = mountRootRef.current;
    const root = rootRef.current;
    const figure = figureVideoRef.current;
    const flock = flockVideoRef.current;
    const figureCanvas = figureCanvasRef.current;
    const flockCanvas = flockCanvasRef.current;
    const figureContainer = figureCanvas?.parentElement;
    const flockContainer = flockCanvas?.parentElement;
    if (!mountRoot || !root || !figure || !flock || !figureCanvas || !flockCanvas
      || !figureContainer || !flockContainer) return;
    disposedRef.current = false;
    for (const video of [figure, flock]) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
    }
    render(0);
    const onFrame = (
      index: 0 | 1,
      canvasRef: typeof figureCanvasRef
    ) => ({ canvas, generation }: Readonly<{
      canvas: HTMLCanvasElement;
      generation: number;
    }>) => {
      const binding = bindingRef.current;
        if (!binding || disposedRef.current
          || generation !== admissionGenerationsRef.current[index]
          || canvas !== canvasRef.current) return;
      readyMaskRef.current |= 1 << index;
      syncPresentedClock();
      updatePairPresentation();
      reportLane(binding, index, generation);
    };
    const figureSurface = createPhonePackedAlphaSurface({
      root,
      container: figureContainer,
      canvas: figureCanvas,
      video: figure,
      packedSourceUrl: PHONE_CRANE_FIGURE_PACKED,
      endpointSeconds: CRANE_VIDEO_END_SECONDS,
      statusDataset: 'phoneCraneFigureAlpha',
      layerName: 'crane-figure',
      canvasClassName: figureCanvas.className,
      renewCanvasAfterFailure: true,
      onCanvasRenewed: (renewed) => {
        figureCanvasRef.current = renewed;
        admissionGenerationsRef.current[0] = 0;
        readyMaskRef.current &= ~1;
        updatePairPresentation();
      },
      onFrame: onFrame(0, figureCanvasRef),
      onFailure: (failure) => reportFailure(0, 'figure', failure)
    });
    const flockSurface = createPhonePackedAlphaSurface({
      root,
      container: flockContainer,
      canvas: flockCanvas,
      video: flock,
      packedSourceUrl: PHONE_CRANE_FLOCK_PACKED,
      endpointSeconds: CRANE_VIDEO_END_SECONDS,
      statusDataset: 'phoneCraneFlockAlpha',
      layerName: 'crane-flock',
      canvasClassName: flockCanvas.className,
      renewCanvasAfterFailure: true,
      onCanvasRenewed: (renewed) => {
        flockCanvasRef.current = renewed;
        admissionGenerationsRef.current[1] = 0;
        readyMaskRef.current &= ~2;
        updatePairPresentation();
      },
      onFrame: onFrame(1, flockCanvasRef),
      onFailure: (failure) => reportFailure(1, 'flock', failure)
    });
    surfacesRef.current = [figureSurface, flockSurface];
    reports.registerMount({
      root: mountRoot,
      surfaces: [
        { id: 'crane-figure-video', element: figure, kind: 'video' },
        {
          id: 'crane-figure-canvas',
          get element() { return figureCanvasRef.current ?? figureCanvas; },
          kind: 'canvas-webgl'
        },
        { id: 'crane-flock-video', element: flock, kind: 'video' },
        {
          id: 'crane-flock-canvas',
          get element() { return flockCanvasRef.current ?? flockCanvas; },
          kind: 'canvas-webgl'
        }
      ],
      commands
    });
    return () => {
      disposedRef.current = true;
      admissionGenerationsRef.current = [0, 0];
      surfaceGenerationsRef.current = [0, 0];
      readyMaskRef.current = 0;
      if (surfacesRef.current?.[0] === figureSurface) {
        figureSurface.dispose('reactivatable');
        flockSurface.dispose('reactivatable');
        surfacesRef.current = null;
      }
      parkPhoneCraneMedia(root);
      updatePairPresentation();
      bindingRef.current = null;
    };
  }, [commands, render, reportFailure, reportLane, reports, syncPresentedClock, updatePairPresentation]);

  return (
    <div ref={mountRootRef} className="phone-crane" data-phone-scene="crane-animation">
      <article
        ref={rootRef}
        className="crane-page r4-crane-animation"
        data-r4-scene="crane-animation"
        data-crane-stage
        aria-label="Crane visual transition scene"
      >
        <section className="crane-scroll" aria-hidden="true">
          <div className="crane-sticky">
            <div className="crane-field" style={{ backgroundImage: `url(${CRANE_PAPER_SRC})` }}>
              <div className="crane-paper" aria-hidden="true" />
              <div className="crane-layer-stack" data-transition-ghost="crane-motion" aria-hidden="true">
                <img className="crane-layer crane-layer--cloud-back" src={CRANE_CLOUD_BACK_SRC} alt="" />
                <div className="crane-video-transition crane-video-transition--figure">
                  <video
                    ref={figureVideoRef}
                    className="crane-figure-video"
                    data-crane-figure-video
                    data-media-key={CRANE_FIGURE_MEDIA_KEY}
                    muted
                    preload="auto"
                    playsInline
                  >
                    <AlphaVideoSources
                      webm={CRANE_FIGURE_VIDEO_SRC}
                      hevc={CRANE_FIGURE_HEVC_ALPHA_SRC}
                    />
                  </video>
                  <canvas
                    ref={figureCanvasRef}
                    className="crane-figure-video phone-crane__figure-canvas"
                    data-phone-packed-alpha-canvas="crane-figure"
                    aria-hidden="true"
                  />
                </div>
                <img className="crane-layer crane-layer--arch" src={CRANE_ARCH_SRC} alt="" />
                <img className="crane-layer crane-layer--cloud-front" src={CRANE_CLOUD_FRONT_SRC} alt="" />
                <img className="crane-layer crane-layer--cloud-front-second" src={CRANE_CLOUD_FRONT_SECOND_SRC} alt="" />
                <div className="crane-video-transition crane-video-transition--front">
                  <video
                    ref={flockVideoRef}
                    className="crane-figure-video crane-figure-video--front"
                    data-crane-figure-front-video
                    data-media-key={CRANE_FLOCK_MEDIA_KEY}
                    muted
                    preload="auto"
                    playsInline
                  >
                    <AlphaVideoSources
                      webm={CRANE_FLOCK_VIDEO_SRC}
                      hevc={CRANE_FLOCK_HEVC_ALPHA_SRC}
                    />
                  </video>
                  <canvas
                    ref={flockCanvasRef}
                    className="crane-figure-video crane-figure-video--front phone-crane__flock-canvas"
                    data-phone-packed-alpha-canvas="crane-flock"
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div className="crane-warmth" aria-hidden="true" />
              <div className="crane-center-wash" aria-hidden="true" />
              <div className="crane-texture" aria-hidden="true" />
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}

export default PhoneCrane;
export const phoneSceneId = 'crane-animation' as const;
