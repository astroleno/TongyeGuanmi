import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { AlphaVideoSources } from '../../../media/alpha-video-sources';
import { primePhoneNativeVideo } from '../../../media/phone-native-video-prime';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
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
  PH_BG_SRC,
  PH_FIGURE_END_SECONDS,
  PH_FIGURE_HEVC_ALPHA_SRC,
  PH_FIGURE_VIDEO_SRC,
  PH_FRONT_SRC,
  PH_MEDIA_KEY,
  parkPhMedia
} from '..';
import {
  renderPhonePhPresentation,
  type PhonePhPlaybackDirection
} from './PhonePh.motion';
import { seekPhonePhReverseFrame } from './PhonePh.reverse';
import './PhonePh.css';

const PHONE_PH_PACKED_VIDEO = phoneMediaUrlFor(
  'ph-figure-packed', 'ph-animation'
);

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
}

export {
  phonePhForegroundParallaxY,
  phonePhPresentationProgress,
  phonePhTimelineProgressForMediaProgress,
  renderPhonePhPresentation
} from './PhonePh.motion';

/** Stable authored fallback; it never claims completion or a prepared frame. */
export function applyPhonePhMediaFallback(
  root: HTMLElement | null | undefined
): void {
  const section = rootFor(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  if (video) {
    disposeTimelineVideoDriver(video);
    video.pause();
  }
  section?.setAttribute('data-phone-ph-media', 'fallback');
  video?.setAttribute('data-phone-ph-media', 'fallback');
  renderPhonePhPresentation(section, 0);
}

export function parkPhonePhMedia(root: HTMLElement | null | undefined): void {
  const section = rootFor(root);
  parkPhMedia(section);
  if (section?.dataset.phonePhMedia !== 'fallback') {
    section?.setAttribute('data-phone-ph-media', 'parked');
  }
}

export type PhonePhProps = Readonly<{ reports: PhoneLeafReportPort }>;

/**
 * Genuine PH leaf. The route runtime owns progress and activation; this leaf
 * owns one persistent decoder/Canvas pair and reports only a physical draw
 * from the active packed-alpha generation.
 */
export function PhonePh({ reports }: PhonePhProps) {
  const mountRootRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const surfaceGenerationRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const progressRef = useRef(0);
  const directionRef = useRef<PhonePhPlaybackDirection>(1);
  const mediaRunTokenRef = useRef<string | null>(null);
  const mediaPhaseRef = useRef<'primed' | 'playing' | 'held'>('held');
  const disposedRef = useRef(false);

  const reportFailure = useCallback((failure: PhonePackedAlphaSurfaceFailure) => {
    const binding = bindingRef.current;
    if (!binding || disposedRef.current
      || failure.generation < surfaceGenerationRef.current) return;
    surfaceGenerationRef.current = failure.generation;
    binding.reports.reportFailure({
      code: `ph-${failure.code}`,
      message: failure.message,
      recoverable: true,
      detail: { generation: failure.generation }
    });
  }, []);

  const render = useCallback((rawProgress: number) => {
    const progress = Math.min(1, Math.max(0, rawProgress));
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    renderPhonePhPresentation(rootRef.current, progress, directionRef.current);
    if (directionRef.current === -1) {
      seekPhonePhReverseFrame(videoRef.current, progress);
    }
    if (surfaceGenerationRef.current > 0) surfaceRef.current?.probe();
  }, []);

  const activateSurface = useCallback((mode: PhonePackedAlphaSurfaceMode) => {
    const surface = surfaceRef.current;
    if (!surface || disposedRef.current) return 0;
    const generation = surface.activate(mode);
    surfaceGenerationRef.current = generation;
    return generation;
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      mediaRunTokenRef.current = null;
      mediaPhaseRef.current = 'held';
      frameSequenceRef.current = 0;
      if (surfaceGenerationRef.current > 0) surfaceRef.current?.probe();
    },
    activate(command): PhoneActivationInvocation {
      const expected = ['ph-figure-video'];
      const video = videoRef.current;
      if (!video || !bindingRef.current || disposedRef.current
        || command.surfaceIds.length !== 1
        || command.surfaceIds[0] !== expected[0]) {
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
      const endpoint = progressRef.current <= .001 ? 0
        : progressRef.current >= .999 ? 1 : null;
      const canvas = canvasRef.current;
      if (endpoint !== null
        && Number(canvas?.dataset.packedAlphaGeneration) === surfaceGenerationRef.current
        && Number(canvas?.dataset.packedAlphaMediaTime) >= (endpoint ? PH_FIGURE_END_SECONDS - .08 : 0)
        && Number(canvas?.dataset.packedAlphaMediaTime) <= (endpoint ? Infinity : .04)) {
        surfaceRef.current?.setMode?.(endpoint === 0 ? 'initial' : 'endpoint');
        rootRef.current?.setAttribute('data-phone-ph-media', 'ready');
        return {
          invocationId: command.invocationId,
          surfaceIds: expected,
          invoked: true,
          settlements: [{ surfaceId: expected[0]!, status: 'fulfilled' }]
        };
      }
      const generation = activateSurface('initial');
      video.pause();
      try { video.currentTime = 0; } catch {
        // The initial compositor callback will arrive after loadeddata.
      }
      rootRef.current?.setAttribute('data-phone-ph-media', 'priming');
      const settled = primePhoneNativeVideo(video, {
        isCurrent: () => !disposedRef.current
          && mediaRunTokenRef.current === runToken
          && bindingRef.current === binding,
        phase: () => mediaPhaseRef.current,
        onRejected: (error: unknown) => {
          if (disposedRef.current || bindingRef.current !== binding) return;
          binding.reports.reportFailure({
            code: 'ph-activation-playback-rejected',
            message: error instanceof Error ? error.message : String(error),
            recoverable: true,
            detail: { runToken }
          });
        }
      });
      return {
        invocationId: command.invocationId,
        surfaceIds: expected,
        invoked: generation > 0,
        settlements: generation > 0
          ? [{ surfaceId: expected[0]!, status: 'pending', settled }]
          : []
      };
    },
    setMediaPhase(command) {
      const binding = bindingRef.current;
      const video = videoRef.current;
      if (!binding || !video || disposedRef.current
        || (mediaRunTokenRef.current !== null
          && mediaRunTokenRef.current !== command.runToken)) return;
      mediaRunTokenRef.current = command.runToken;
      directionRef.current = command.direction === 'reverse' ? -1 : 1;
      if (command.phase === 'primed') {
        mediaPhaseRef.current = 'primed';
        video.pause();
        return;
      }
      if (command.phase === 'held') {
        mediaPhaseRef.current = 'held';
        video.pause();
        try {
          video.currentTime = (command.endpoint ?? (command.direction === 'reverse' ? 0 : 1)) === 0
            ? 0 : PH_FIGURE_END_SECONDS;
        } catch { /* retry on metadata */ }
        return;
      }
      surfaceRef.current?.setMode?.('forward');
      mediaPhaseRef.current = 'playing';
      if (command.direction === 'reverse') {
        // Reverse PH is presented-frame sampling; HTML video cannot run
        // backwards, so render() owns the paused decoder seek.
        video.pause();
        return;
      }
      let playback: Promise<void>;
      try { playback = Promise.resolve(video.play()); }
      catch (error) { playback = Promise.reject(error); }
      void playback.catch((error: unknown) => binding.reports.reportFailure({
        code: 'ph-playback-rejected',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
        detail: { runToken: command.runToken, direction: command.direction }
      }));
    },
    render,
    settle(endpoint) {
      directionRef.current = endpoint === 0 ? 1 : -1;
      progressRef.current = endpoint;
      render(endpoint);
      const video = videoRef.current;
      video?.pause();
      try {
        if (video) video.currentTime = endpoint === 0 ? 0 : PH_FIGURE_END_SECONDS;
      } catch { /* retry on metadata */ }
    },
    pause() {
      mediaRunTokenRef.current = null;
      mediaPhaseRef.current = 'held';
      parkPhonePhMedia(rootRef.current);
    },
    dispose(reason: PhoneLeafDisposeReason) {
      if (disposedRef.current) return;
      disposedRef.current = true;
      mediaRunTokenRef.current = null;
      mediaPhaseRef.current = 'held';
      surfaceGenerationRef.current = 0;
      if (['closure-retired', 'faulted', 'route-dispose'].includes(reason)) surfaceRef.current?.dispose('terminal');
      else surfaceRef.current?.dispose('reactivatable');
      surfaceRef.current = null;
      parkPhonePhMedia(rootRef.current);
      bindingRef.current = null;
    }
  }), [activateSurface, render]);

  useLayoutEffect(() => {
    const mountRoot = mountRootRef.current;
    const root = rootRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!mountRoot || !root || !video || !canvas || !container) return;
    disposedRef.current = false;
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    root.style.setProperty('--phone-ph-island-source', `url(${JSON.stringify(PH_FRONT_SRC)})`);
    render(0);
    const surface = createPhonePackedAlphaSurface({
      root,
      container,
      canvas,
      video,
      packedSourceUrl: PHONE_PH_PACKED_VIDEO,
      endpointSeconds: PH_FIGURE_END_SECONDS,
      statusDataset: 'phonePhAlpha',
      layerName: 'ph-figure',
      canvasClassName: canvas.className,
      renewCanvasAfterFailure: true,
      onCanvasRenewed: (renewed) => { canvasRef.current = renewed; },
      onFrame: ({ canvas: drawnCanvas, generation }) => {
        const binding = bindingRef.current;
        if (!binding || disposedRef.current
          || generation !== surfaceGenerationRef.current
          || drawnCanvas !== canvasRef.current) return;
        root.dataset.phonePhMedia = 'ready';
        binding.reports.reportFrame('ph-figure-canvas', {
          kind: 'frame',
          token: binding.frameToken,
          presented: true,
          frameId: `ph-packed:${generation}:${++frameSequenceRef.current}`,
          detail: {
            compositorDrawn: true,
            generation,
            progress: progressRef.current
          }
        });
      },
      onFailure: reportFailure
    });
    surfaceRef.current = surface;
    const canvasSurface = {
      id: 'ph-figure-canvas',
      get element() { return canvasRef.current ?? canvas; },
      kind: 'canvas-webgl' as const
    };
    reports.registerMount({
      root: mountRoot,
      surfaces: [
        { id: 'ph-figure-video', element: video, kind: 'video' },
        canvasSurface
      ],
      commands
    });
    return () => {
      disposedRef.current = true;
      surfaceGenerationRef.current = 0;
      if (surfaceRef.current === surface) {
        surface.dispose('reactivatable');
        surfaceRef.current = null;
      }
      parkPhonePhMedia(root);
      root.style.removeProperty('--phone-ph-island-source');
      bindingRef.current = null;
    };
  }, [commands, render, reportFailure, reports]);

  return (
    <div ref={mountRootRef} className="phone-ph__mount">
      <section
        ref={rootRef}
        className="phone-ph"
        data-phone-scene="ph-animation"
        data-phone-media-owner="ph-figure-packed"
        data-phone-ph-media="preparing"
        aria-hidden="true"
      >
        <article
          className="ph-page r4-ph-animation"
          data-r4-scene="ph-animation"
          data-ph-stage
          aria-label="Pythagoreans Hymn visual scene"
        >
          <div className="ph-scroll">
            <div className="ph-sticky">
              <div className="ph-field">
                <img className="ph-bg" src={PH_BG_SRC} alt="" aria-hidden="true" />
                <div className="ph-paper" aria-hidden="true" />
                <div className="ph-sun-wash" aria-hidden="true" />
                <div className="ph-layer-stack" aria-hidden="true">
                  <img className="ph-layer ph-layer--front" src={PH_FRONT_SRC} alt="" />
                  <video
                    ref={videoRef}
                    className="ph-layer ph-layer--figure"
                    data-ph-alpha-video
                    data-media-key={PH_MEDIA_KEY}
                    muted
                    preload="auto"
                    playsInline
                  >
                    <AlphaVideoSources
                      webm={PH_FIGURE_VIDEO_SRC}
                      hevc={PH_FIGURE_HEVC_ALPHA_SRC}
                    />
                  </video>
                  <canvas
                    ref={canvasRef}
                    className="ph-layer ph-layer--figure phone-ph__figure-canvas"
                    data-phone-packed-alpha-canvas="ph-figure"
                    aria-hidden="true"
                  />
                </div>
                <div className="ph-edge-light" aria-hidden="true" />
                <div className="ph-texture" aria-hidden="true" />
                <div className="ph-progress" aria-hidden="true"><span /></div>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

export default PhonePh;
export const phoneSceneId = 'ph-animation' as const;
