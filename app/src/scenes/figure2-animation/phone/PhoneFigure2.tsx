import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  primePhoneNativeVideo,
  type PhoneNativeVideoPrimeOptions
} from '../../../media/phone-native-video-prime';
import { driveTimelineVideo } from '../../../media/timeline-video-driver';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceFailure
} from '../../../media/phone-packed-alpha-surface';
import { phoneMediaUrlFor } from '../../../media/phone-media';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import {
  disposeFigure2Media,
  figure2AnimationScene,
  parkFigure2Media,
  renderFigure2AnimationProgress
} from '..';
import './PhoneFigure2.css';

const Figure2Surface = figure2AnimationScene.Component;
const FIGURE2_PACKED_ALPHA_VIDEO = phoneMediaUrlFor(
  'figure2-pair-packed', 'figure2-animation'
);
const FIGURE2_POSTER_IMAGE = phoneMediaUrlFor(
  'figure2-pair-poster', 'figure2-animation'
);
const FIGURE2_ENDPOINT_SECONDS = 2.6;
const FIGURE2_STAGED_SEGMENT = 'figure2-distance-expand';

function waitForDecodedImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve();
  }
  if (typeof image.decode === 'function') return image.decode();
  return new Promise((resolve, reject) => {
    const clear = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
    const loaded = () => { clear(); resolve(); };
    const failed = () => { clear(); reject(new Error('Figure2 poster decode failed')); };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
  });
}

export type PhoneFigure2Props = Readonly<{ reports: PhoneLeafReportPort }>;

function isFigure2MediaLeg(binding: PhoneLeafGenerationBinding | null): boolean {
  if (!binding || binding.segmentId !== FIGURE2_STAGED_SEGMENT
    || binding.stageIndex === undefined || !binding.direction) return true;
  return binding.direction === 'reverse' ? binding.stageIndex === 1 : binding.stageIndex === 0;
}

function isFigure2ReverseMediaLeg(binding: PhoneLeafGenerationBinding | null): boolean {
  return Boolean(binding?.segmentId === FIGURE2_STAGED_SEGMENT
    && binding.direction === 'reverse' && binding.stageIndex === 1);
}

function holdFigure2Media(video: HTMLVideoElement | null): void {
  if (!video) return;
  video.pause();
  try {
    if (!Number.isFinite(video.currentTime)
      || Math.abs(video.currentTime - FIGURE2_ENDPOINT_SECONDS) > .03) {
      video.currentTime = FIGURE2_ENDPOINT_SECONDS;
    }
  } catch {
    // Source replacement races can reject an endpoint write; the packed
    // surface's endpoint seek listener will retry after metadata arrives.
  }
}

function primeFigure2Video(
  video: HTMLVideoElement,
  endpointSeconds = 0,
  options?: PhoneNativeVideoPrimeOptions
): Promise<void> {
  return primePhoneNativeVideo(video, options).then(() => {
    try { video.currentTime = endpointSeconds; } catch { /* metadata may still be settling */ }
  });
}

/** Genuine Figure2 leaf with one decoded source and one visible Canvas.
 * The foreground arch is presentation-owned so it can survive into Proof. */
export function PhoneFigure2({ reports }: PhoneFigure2Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const surfaceGenerationRef = useRef(0);
  const canvasPresentationGenerationRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const progressRef = useRef(0);
  const posterReadyRef = useRef(false);
  const reportedPosterTokenRef = useRef<string | null>(null);
  const mediaRunTokenRef = useRef<string | null>(null);
  const mediaPhaseRef = useRef<'primed' | 'playing' | 'held'>('held');
  const disposedRef = useRef(false);
  const [posterHost, setPosterHost] = useState<HTMLElement | null>(null);

  const reportFailure = useCallback((failure: PhonePackedAlphaSurfaceFailure) => {
    if (disposedRef.current || failure.generation < surfaceGenerationRef.current) return;
    surfaceGenerationRef.current = failure.generation;
    canvasPresentationGenerationRef.current = 0;
    delete rootRef.current?.dataset.phoneFigure2CanvasReady;
    bindingRef.current?.reports.reportFailure({
      code: `figure2-${failure.code}`,
      message: failure.message,
      recoverable: true,
      detail: { generation: failure.generation }
    });
  }, []);

  const render = useCallback((progress: number) => {
    const clamped = Math.min(1, Math.max(0, progress));
    progressRef.current = clamped;
    renderFigure2AnimationProgress(sceneRef.current, clamped, { videoMode: 'none' });
    const binding = bindingRef.current;
    const staged = binding?.segmentId === FIGURE2_STAGED_SEGMENT;
    if (isFigure2ReverseMediaLeg(binding) && videoRef.current) {
      try {
        driveTimelineVideo(videoRef.current, {
          runId: mediaRunTokenRef.current ?? binding?.frameToken ?? 'figure2-reverse',
          direction: -1,
          progress: clamped,
          durationFallbackSeconds: FIGURE2_ENDPOINT_SECONDS,
          startSeconds: 0,
          endSeconds: FIGURE2_ENDPOINT_SECONDS,
          timelineDurationMs: FIGURE2_ENDPOINT_SECONDS * 1000,
          mode: 'timeline',
          nativePlaybackDirection: 1,
          allowSeekedFrameFallback: true
        });
      } catch {
        // The packed surface reports causal seek failures; reverse media must
        // never fall back to native forward playback.
      }
    }
    const hold = staged && (!isFigure2MediaLeg(binding)
      || binding.direction === 'forward' && binding.stageIndex === 0 && clamped >= .999);
    if (hold) holdFigure2Media(videoRef.current);
    if (surfaceGenerationRef.current > 0) surfaceRef.current?.probe();
  }, []);

  const reportPoster = useCallback(() => {
    const binding = bindingRef.current;
    if (!posterReadyRef.current || !binding || disposedRef.current
      || reportedPosterTokenRef.current === binding.frameToken) return;
    reportedPosterTokenRef.current = binding.frameToken;
    binding.reports.reportPrepared('figure2-pair-poster', {
      kind: 'image-decoded',
      token: `figure2:poster:${binding.frameToken}`,
      ready: true,
      detail: { posterDecoded: true }
    });
  }, []);

  const setMediaPhase = useCallback((command: import('../../../production/phone-story/protocol').PhoneMediaPhaseCommand) => {
    const binding = bindingRef.current;
    const video = videoRef.current;
    if (!binding || !video || disposedRef.current) return;
    if (command.phase === 'primed') {
      mediaRunTokenRef.current = command.runToken;
      mediaPhaseRef.current = 'primed';
      if (!isFigure2MediaLeg(binding)) {
        surfaceRef.current?.setMode?.('endpoint');
        holdFigure2Media(video);
        surfaceRef.current?.probe();
        return;
      }
      video.pause();
      try { video.currentTime = 0; } catch { /* source may still be loading */ }
      return;
    }
    if (command.phase === 'held' || !isFigure2MediaLeg(binding)) {
      mediaPhaseRef.current = 'held';
      holdFigure2Media(video);
      return;
    }
    if (mediaRunTokenRef.current !== null
      && mediaRunTokenRef.current !== command.runToken) return;
    mediaRunTokenRef.current = command.runToken;
    mediaPhaseRef.current = 'playing';
    surfaceRef.current?.setMode?.('forward');
    if (command.direction === 'reverse') return;
    let playback: Promise<void>;
    try { playback = Promise.resolve(video.play()); }
    catch (error) { playback = Promise.reject(error); }
    void playback.catch((error: unknown) => {
      if (disposedRef.current || binding !== bindingRef.current) return;
      binding.reports.reportFailure({
        code: 'figure2-forward-playback-rejected',
        message: error && typeof error === 'object'
          && typeof (error as { message?: unknown }).message === 'string'
          ? String((error as { message: string }).message) : String(error),
        recoverable: true,
        detail: { generation: surfaceGenerationRef.current,
          stageIndex: binding.stageIndex ?? null, direction: binding.direction ?? null,
          runToken: command.runToken }
      });
    });
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      mediaRunTokenRef.current = null;
      mediaPhaseRef.current = 'held';
      frameSequenceRef.current = 0;
      reportedPosterTokenRef.current = null;
      reportPoster();
      if (!isFigure2MediaLeg(binding)) holdFigure2Media(videoRef.current);
    },
    activate(command): PhoneActivationInvocation {
      const expected = ['figure2-pair-video'];
      const surface = surfaceRef.current;
      const video = videoRef.current;
      const binding = bindingRef.current;
      if (!surface || !video || !binding || command.surfaceIds.length !== 1
        || command.surfaceIds[0] !== expected[0]) return {
        invocationId: command.invocationId,
        surfaceIds: command.surfaceIds,
        invoked: false,
        settlements: []
      };
      mediaRunTokenRef.current = command.runToken ?? command.invocationId;
      mediaPhaseRef.current = 'primed';
      const reverseActivation = command.direction === 'reverse';
      const generation = surface.activate(reverseActivation ? 'endpoint' : 'initial');
      canvasPresentationGenerationRef.current = 0;
      delete rootRef.current?.dataset.phoneFigure2CanvasReady;
      surfaceGenerationRef.current = generation;
      canvasPresentationGenerationRef.current = generation;
      if (reverseActivation) {
        surface.probe();
        return {
          invocationId: command.invocationId,
          surfaceIds: expected,
          invoked: generation > 0,
          settlements: generation > 0
            ? [{ surfaceId: expected[0]!, status: 'fulfilled' }]
            : []
        };
      }
      const settled = primeFigure2Video(
        video, 0, {
          isCurrent: () => !disposedRef.current
            && mediaRunTokenRef.current === (command.runToken ?? command.invocationId)
            && bindingRef.current === binding,
          phase: () => mediaPhaseRef.current,
          onRejected: (error: unknown) => {
            if (disposedRef.current || bindingRef.current !== binding) return;
            binding.reports.reportFailure({
              code: 'figure2-activation-playback-rejected',
              message: error instanceof Error ? error.message : String(error),
              recoverable: true,
              detail: { runToken: command.runToken ?? command.invocationId }
            });
          }
        }
      ).then(() => {
        if (generation !== surfaceGenerationRef.current) {
          throw new Error('Figure2 activation was superseded before media prime');
        }
        surfaceRef.current?.probe();
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
    setMediaPhase,
    render,
    settle(endpoint) {
      mediaPhaseRef.current = 'held';
      render(endpoint);
      if (endpoint !== 0) return;
      surfaceGenerationRef.current = 0;
      canvasPresentationGenerationRef.current = 0;
      delete rootRef.current?.dataset.phoneFigure2CanvasReady;
      surfaceRef.current?.release();
      parkFigure2Media(sceneRef.current);
    },
    pause() {
      mediaPhaseRef.current = 'held';
      surfaceGenerationRef.current = 0;
      canvasPresentationGenerationRef.current = 0;
      delete rootRef.current?.dataset.phoneFigure2CanvasReady;
      surfaceRef.current?.release();
      parkFigure2Media(sceneRef.current);
    },
    dispose() {
      mediaPhaseRef.current = 'held';
      disposedRef.current = true;
      surfaceGenerationRef.current = 0;
      canvasPresentationGenerationRef.current = 0;
      delete rootRef.current?.dataset.phoneFigure2CanvasReady;
      surfaceRef.current?.dispose('terminal');
      surfaceRef.current = null;
      disposeFigure2Media(sceneRef.current);
      bindingRef.current = null;
    }
  }), [render, reportPoster, setMediaPhase]);

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name !== 'stage') return;
    const scene = element?.closest<HTMLElement>('[data-r4-scene="figure2-animation"]') ?? null;
    sceneRef.current = scene;
    if (scene) scene.dataset.phoneRuntimeOwned = 'true';
  }, []);

  useLayoutEffect(() => {
    setPosterHost(sceneRef.current?.querySelector<HTMLElement>(
      '.r4-figure2__media-stack--combined'
    ) ?? null);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const scene = sceneRef.current;
    const video = scene?.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
    const poster = posterRef.current;
    const canvas = scene?.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]');
    const container = canvas?.parentElement;
    if (!root || !scene || !video || !poster || !canvas || !container) return;
    const arch = root.closest<HTMLElement>('.phone-story')?.querySelector<HTMLImageElement>(
      '[data-stage-retained-figure2-arch="true"]'
    ) ?? null;
    disposedRef.current = false;
    delete root.dataset.phoneFigure2CanvasReady;
    videoRef.current = video;
    posterReadyRef.current = false;
    reportedPosterTokenRef.current = null;
    canvasRef.current = canvas;
    render(0);
    const surface = createPhonePackedAlphaSurface({
      root: scene,
      container,
      canvas,
      video,
      packedSourceUrl: FIGURE2_PACKED_ALPHA_VIDEO,
      endpointSeconds: FIGURE2_ENDPOINT_SECONDS,
      statusDataset: 'phoneFigure2Alpha',
      layerName: 'figure2-pair',
      canvasClassName: canvas.className,
      renewCanvasAfterFailure: true,
      onCanvasRenewed: (renewed) => {
        canvasRef.current = renewed;
        canvasPresentationGenerationRef.current = 0;
        delete root.dataset.phoneFigure2CanvasReady;
      },
      onFrame: ({ canvas: drawnCanvas, generation }) => {
        const binding = bindingRef.current;
        if (!binding || disposedRef.current || generation !== surfaceGenerationRef.current
          || generation !== canvasPresentationGenerationRef.current
          || drawnCanvas !== canvasRef.current) return;
        if (!isFigure2MediaLeg(binding)
          && (!video.paused || Math.abs(video.currentTime - FIGURE2_ENDPOINT_SECONDS) > .03)) return;
        root.dataset.phoneFigure2CanvasReady = 'true';
        binding.reports.reportFrame('figure2-pair-canvas', {
          kind: 'frame', token: binding.frameToken, presented: true,
          frameId: `figure2-packed:${generation}:${++frameSequenceRef.current}`,
          detail: { compositorDrawn: true, generation }
        });
      },
      onFailure: reportFailure
    });
    surfaceRef.current = surface;
    const canvasSurface = {
      id: 'figure2-pair-canvas',
      get element() { return canvasRef.current ?? canvas; },
      kind: 'canvas-webgl' as const
    };
    reports.registerMount({
      root,
      surfaces: [
        { id: 'figure2-pair-video', element: video, kind: 'video' },
        { id: 'figure2-pair-poster', element: poster, kind: 'image' },
        canvasSurface,
        ...(arch ? [{ id: 'figure2-foreground-arch', element: arch, kind: 'image' as const }] : [])
      ],
      commands
    });
    let current = true;
    void waitForDecodedImage(poster).then(() => {
      if (!current || disposedRef.current || posterRef.current !== poster) return;
      posterReadyRef.current = true;
      reportPoster();
    }, (error: unknown) => {
      if (!current || disposedRef.current || posterRef.current !== poster) return;
      bindingRef.current?.reports.reportFailure({
        code: 'figure2-poster-decode-rejected',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true
      });
    });
    return () => {
      current = false;
      disposedRef.current = true;
      surfaceGenerationRef.current = 0;
      canvasPresentationGenerationRef.current = 0;
      delete root.dataset.phoneFigure2CanvasReady;
      posterReadyRef.current = false;
      reportedPosterTokenRef.current = null;
      surface.dispose('terminal');
      if (surfaceRef.current === surface) surfaceRef.current = null;
      disposeFigure2Media(scene);
      delete scene.dataset.phoneRuntimeOwned;
      videoRef.current = null;
      posterRef.current = null;
      canvasRef.current = null;
      bindingRef.current = null;
    };
  }, [commands, posterHost, render, reportFailure, reportPoster, reports]);

  return (
    <div ref={rootRef} className="phone-figure2" data-testid="r2-stage">
      <Figure2Surface
        scene="figure2-animation"
        hidden={false}
        registerHandle={registerHandle}
      />
      {posterHost ? createPortal(
        <img
          ref={posterRef}
          className="phone-figure2__poster"
          data-phone-figure2-poster
          src={FIGURE2_POSTER_IMAGE}
          alt=""
          aria-hidden="true"
        />,
        posterHost
      ) : null}
    </div>
  );
}

export default PhoneFigure2;
export const phoneSceneId = 'figure2-animation' as const;
