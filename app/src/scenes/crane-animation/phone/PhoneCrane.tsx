import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { AlphaVideoSources } from '../../../media/alpha-video-sources';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
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
  PHONE_CRANE_FIGURE_PLAYBACK_RATE,
  PHONE_CRANE_FLOCK_PLAYBACK_RATE,
  phoneCraneVideos,
  seekPhoneCraneReverseFrames
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
  if (section?.dataset.phoneCraneMedia !== 'fallback') {
    section?.setAttribute('data-phone-crane-media', 'parked');
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
  const frameSequenceRef = useRef(0);
  const progressRef = useRef(0);
  const directionRef = useRef<PhoneCranePlaybackDirection>(1);
  const mediaRunTokenRef = useRef<string | null>(null);
  const mediaCommandRef = useRef<import('../../../production/phone-story/protocol').PhoneMediaPhaseCommand | null>(null);
  const mediaPhaseRef = useRef<'primed' | 'playing' | 'held'>('primed');
  const figureReleasedRef = useRef(false);
  const figureClockStartedRef = useRef(false);
  const disposedRef = useRef(false);

  const reportFailure = useCallback((
    index: 0 | 1,
    layer: 'figure' | 'flock',
    failure: PhonePackedAlphaSurfaceFailure
  ) => {
    const binding = bindingRef.current;
    if (!binding || disposedRef.current
      || failure.generation < surfaceGenerationsRef.current[index]) return;
    surfaceGenerationsRef.current[index] = failure.generation;
    binding.reports.reportFailure({
      code: `crane-${layer}-${failure.code}`,
      message: failure.message,
      recoverable: true,
      detail: { generation: failure.generation, layer }
    });
  }, []);

  const startNativeClock = useCallback((
    video: HTMLVideoElement,
    layer: 'figure' | 'flock',
    command: import('../../../production/phone-story/protocol').PhoneMediaPhaseCommand
  ) => {
    let playback: Promise<void>;
    try { playback = Promise.resolve(video.play()); }
    catch (error) { playback = Promise.reject(error); }
    void playback.catch((error: unknown) => {
      const binding = bindingRef.current;
      if (!binding || disposedRef.current || mediaRunTokenRef.current !== command.runToken) return;
      binding.reports.reportFailure({
        code: `crane-${layer}-playback-rejected`,
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
        detail: { runToken: command.runToken, direction: command.direction, layer }
      });
    });
  }, []);

  const render = useCallback((rawProgress: number) => {
    const progress = Math.min(1, Math.max(0, rawProgress));
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const figure = figureVideoRef.current;
    const flock = flockVideoRef.current;
    if (directionRef.current === -1) {
      seekPhoneCraneReverseFrames(figure, flock, progress);
    } else if (bindingRef.current?.segmentId === 'crane-contact'
      && mediaPhaseRef.current === 'playing'
      && !figureClockStartedRef.current && progress >= 1 / 6) {
      figureReleasedRef.current = true;
      figureClockStartedRef.current = true;
      const command = mediaCommandRef.current;
      if (command && figure) startNativeClock(figure, 'figure', command);
      rootRef.current?.setAttribute('data-phone-crane-figure-preroll', 'released');
    }
    renderPhoneCranePresentation(rootRef.current, progress, directionRef.current);
    for (const [index, surface] of (surfacesRef.current ?? []).entries()) {
      if ((surfaceGenerationsRef.current[index] ?? 0) > 0) surface.probe();
    }
  }, [startNativeClock]);

  const activateSurfaces = useCallback((mode: PhonePackedAlphaSurfaceMode) => {
    const surfaces = surfacesRef.current;
    if (!surfaces || disposedRef.current) return [0, 0] as const;
    const generations = surfaces.map((surface) => surface.activate(mode)) as [number, number];
    surfaceGenerationsRef.current = generations;
    return generations;
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      mediaRunTokenRef.current = null;
      mediaPhaseRef.current = 'held';
      mediaCommandRef.current = null;
      mediaPhaseRef.current = 'primed';
      figureClockStartedRef.current = false;
      frameSequenceRef.current = 0;
      for (const [index, surface] of (surfacesRef.current ?? []).entries()) {
        if ((surfaceGenerationsRef.current[index] ?? 0) > 0) surface.probe();
      }
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
      mediaCommandRef.current = null;
      mediaPhaseRef.current = 'primed';
      const binding = bindingRef.current;
      const generations = activateSurfaces('initial');
      figureReleasedRef.current = false;
      figureClockStartedRef.current = false;
      delete rootRef.current?.dataset.phoneCraneFigurePreroll;
      videos[0]!.playbackRate = PHONE_CRANE_FIGURE_PLAYBACK_RATE;
      videos[1]!.playbackRate = PHONE_CRANE_FLOCK_PLAYBACK_RATE;
      for (const video of videos) {
        video!.pause();
        try { video!.currentTime = 0; } catch {
          // The initial compositor callback will arrive after loadeddata.
        }
      }
      rootRef.current?.setAttribute('data-phone-crane-media', 'priming');
      const settled = generations.every((generation) => generation > 0)
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
        settlements: generations.every((generation) => generation > 0)
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
      mediaCommandRef.current = command;
      directionRef.current = command.direction === 'reverse' ? -1 : 1;
      if (command.phase === 'primed') {
        mediaPhaseRef.current = 'primed';
        figureClockStartedRef.current = false;
        for (const video of videos) video?.pause();
        return;
      }
      if (command.phase === 'held') {
        mediaPhaseRef.current = 'held';
        const endpoint = command.endpoint ?? (command.direction === 'reverse' ? 0 : 1);
        for (const video of videos) {
          video?.pause();
          try { if (video) video.currentTime = endpoint === 0 ? 0 : CRANE_VIDEO_END_SECONDS; } catch { /* retry */ }
        }
        return;
      }
      mediaPhaseRef.current = 'playing';
      rootRef.current?.setAttribute('data-phone-crane-media', 'playing');
      for (const surface of surfacesRef.current ?? []) surface.setMode?.('forward');
      if (command.direction === 'reverse') {
        // Reverse Crane is a runtime-driven presented-frame playhead. HTML
        // video cannot run backwards; render() seeks each paused decoder to
        // the requested frame, so a native play here would race those seeks.
        for (const video of videos) video?.pause();
        return;
      }
      const delayedFigure = binding.segmentId === 'crane-contact';
      if (delayedFigure) {
        figureClockStartedRef.current = false;
        figureReleasedRef.current = false;
        videos[0]?.pause();
        if (videos[1]) startNativeClock(videos[1], 'flock', command);
        if (progressRef.current >= 1 / 6 && videos[0]) {
          figureClockStartedRef.current = true;
          startNativeClock(videos[0], 'figure', command);
        }
        return;
      }
      for (const [index, video] of videos.entries()) {
        if (video) startNativeClock(video, index === 0 ? 'figure' : 'flock', command);
      }
    },
    render,
    settle(endpoint) {
      directionRef.current = endpoint === 0 ? 1 : -1;
      progressRef.current = endpoint;
      render(endpoint);
      const videos = [figureVideoRef.current, flockVideoRef.current] as const;
      for (const video of videos) {
        video?.pause();
        try {
          if (video) video.currentTime = endpoint === 0 ? 0 : CRANE_VIDEO_END_SECONDS;
        } catch { /* retry on metadata */ }
      }
    },
    pause() {
      mediaRunTokenRef.current = null;
      mediaCommandRef.current = null;
      mediaPhaseRef.current = 'held';
      figureClockStartedRef.current = false;
      parkPhoneCraneMedia(rootRef.current);
    },
    dispose() {
      if (disposedRef.current) return;
      disposedRef.current = true;
      mediaRunTokenRef.current = null;
      mediaCommandRef.current = null;
      surfaceGenerationsRef.current = [0, 0];
      for (const surface of surfacesRef.current ?? []) surface.dispose('terminal');
      surfacesRef.current = null;
      parkPhoneCraneMedia(rootRef.current);
      bindingRef.current = null;
    }
  }), [activateSurfaces, render, startNativeClock]);

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
      layer: 'figure' | 'flock',
      surfaceId: 'crane-figure-canvas' | 'crane-flock-canvas',
      canvasRef: typeof figureCanvasRef
    ) => ({ canvas, generation }: Readonly<{
      canvas: HTMLCanvasElement;
      generation: number;
    }>) => {
      const binding = bindingRef.current;
      if (!binding || disposedRef.current
        || generation !== surfaceGenerationsRef.current[index]
        || canvas !== canvasRef.current) return;
      root.dataset.phoneCraneMedia = 'ready';
      binding.reports.reportFrame(surfaceId, {
        kind: 'frame',
        token: binding.frameToken,
        presented: true,
        frameId: `crane-${layer}-packed:${generation}:${++frameSequenceRef.current}`,
        detail: { compositorDrawn: true, generation, layer, progress: progressRef.current }
      });
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
      onCanvasRenewed: (renewed) => { figureCanvasRef.current = renewed; },
      onFrame: onFrame(0, 'figure', 'crane-figure-canvas', figureCanvasRef),
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
      onCanvasRenewed: (renewed) => { flockCanvasRef.current = renewed; },
      onFrame: onFrame(1, 'flock', 'crane-flock-canvas', flockCanvasRef),
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
      surfaceGenerationsRef.current = [0, 0];
      if (surfacesRef.current?.[0] === figureSurface) {
        figureSurface.dispose('terminal');
        flockSurface.dispose('terminal');
        surfacesRef.current = null;
      }
      parkPhoneCraneMedia(root);
      delete root.dataset.phoneCraneFigurePreroll;
      bindingRef.current = null;
      figureVideoRef.current = null;
      flockVideoRef.current = null;
      figureCanvasRef.current = null;
      flockCanvasRef.current = null;
    };
  }, [commands, render, reportFailure, reports]);

  return (
    <div ref={mountRootRef} className="phone-crane" data-phone-scene="crane-animation">
      <article
        ref={rootRef}
        className="crane-page r4-crane-animation"
        data-r4-scene="crane-animation"
        data-crane-stage
        data-phone-crane-media="preparing"
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
