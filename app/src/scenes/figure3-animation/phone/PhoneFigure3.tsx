import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame,
  type TimelineVideoDriveInput
} from '../../../media/timeline-video-driver';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import {
  FIGURE3_END_SECONDS,
  figure3AnimationScene,
  renderFigure3AnimationProgress
} from '..';
import {
  createPhoneFigure3PaperCompositor,
  releasePhoneFigure3PaperCanvas,
  type PhoneFigure3PaperCompositor
} from './paper-compositor';
import './PhoneFigure3.css';

const Figure3Surface = figure3AnimationScene.Component;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type PhoneFigure3Frame = Readonly<{
  progress: number;
  videoOpacity: number;
  videoScale: number;
  backdropOpacity: number;
  backdropScale: number;
}>;

export type PhoneFigure3MediaAction =
  | 'release'
  | 'static-fallback'
  | 'play-forward'
  | 'play-reverse'
  | 'hold-initial'
  | 'hold-terminal';

export type PhoneFigure3Props = Readonly<{ reports: PhoneLeafReportPort }>;

function smoothStep(value: number): number {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

function range01(value: number, start: number, end: number): number {
  return clamp((value - start) / Math.max(.0001, end - start));
}

/** Phone-specific Figure3 framing; it never scales a desktop scene tree. */
export function phoneFigure3Frame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false
): PhoneFigure3Frame {
  const progress = mediaFailed ? 1 : reducedMotion ? 0 : clamp(rawProgress);
  const visualProgress = .78 * progress + .22 * progress * progress;
  const backdropSettle = smoothStep(range01(visualProgress, .06, .84));
  return {
    progress,
    videoOpacity: mediaFailed || reducedMotion ? 0 : 1,
    videoScale: 1.015 + visualProgress * .035,
    backdropOpacity: 1 - backdropSettle * .46,
    backdropScale: 1.06 + backdropSettle * .08
  };
}

/** Legacy decision helper retained as a pure endpoint contract. */
export function phoneFigure3MediaAction(
  active: boolean,
  prewarm = false,
  reducedMotion = false,
  mediaFailed = false,
  hasForwardRun = false,
  direction: 1 | -1 = 1
): PhoneFigure3MediaAction {
  if (reducedMotion || mediaFailed) return 'static-fallback';
  if (active) return direction === -1 ? 'play-reverse' : 'play-forward';
  if (!prewarm) return 'release';
  return hasForwardRun ? 'hold-terminal' : 'hold-initial';
}

/** Hard retirement only: pause/rebind never tears down this persistent source. */
export function releasePhoneFigure3Video(video: HTMLVideoElement | null): void {
  if (!video) return;
  disposeTimelineVideoDriver(video);
  video.pause();
  video.removeAttribute('src');
  for (const source of video.querySelectorAll('source')) source.removeAttribute('src');
  try {
    video.load();
  } catch {
    // Detached/mock media elements can reject a post-dispose load.
  }
}

export type PhoneFigure3Endpoint = 0 | 1;

export function phoneFigure3RunStartEndpoint(direction: 1 | -1): PhoneFigure3Endpoint {
  return direction === 1 ? 0 : 1;
}

export function phoneFigure3CanStartPreparedRun(
  direction: 1 | -1,
  readyEndpoint: PhoneFigure3Endpoint | null
): boolean {
  return readyEndpoint === phoneFigure3RunStartEndpoint(direction);
}

const PHONE_FIGURE3_ENDPOINT_TOLERANCE_SECONDS = .05;
export const PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS = 240;

export function phoneFigure3EndpointIsPresented(
  endpoint: PhoneFigure3Endpoint,
  currentTime: number,
  readyState: number,
  seeking: boolean
): boolean {
  const targetTime = endpoint === 0 ? 0 : FIGURE3_END_SECONDS;
  return Number.isFinite(currentTime)
    && readyState >= 2
    && !seeking
    && Math.abs(currentTime - targetTime) <= PHONE_FIGURE3_ENDPOINT_TOLERANCE_SECONDS;
}

export function phoneFigure3HasReusableEndpointFrame(
  video: Pick<HTMLVideoElement, 'currentTime' | 'readyState' | 'seeking'>,
  canvas: Pick<HTMLCanvasElement, 'dataset'>,
  endpoint: PhoneFigure3Endpoint
): boolean {
  return canvas.dataset.phoneFigure3PaperFrame === 'ready'
    && canvas.dataset.phoneFigure3PaperEndpoint === (endpoint === 1 ? 'terminal' : 'initial')
    && phoneFigure3EndpointIsPresented(
      endpoint, video.currentTime, video.readyState, video.seeking
    );
}

function figure3TimelineMediaInput(
  runId: string,
  direction: 1 | -1,
  progress: number
): TimelineVideoDriveInput {
  return {
    runId,
    direction,
    progress: clamp(progress),
    durationFallbackSeconds: 2.6,
    startSeconds: 0,
    endSeconds: FIGURE3_END_SECONDS,
    timelineDurationMs: FIGURE3_END_SECONDS * 1000,
    mode: 'timeline',
    nativePlaybackDirection: 1,
    allowSeekedFrameFallback: browserPrefersHevcAlpha()
  };
}

/**
 * Genuine clean Figure3 leaf. Runtime owns the canonical clock and invokes
 * render(progress); this leaf owns exactly one decoder and one persistent
 * paper Canvas until its closure is terminally retired.
 */
export function PhoneFigure3({ reports }: PhoneFigure3Props) {
  const mountRootRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositorRef = useRef<PhoneFigure3PaperCompositor | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const progressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const settledEndpointRef = useRef<PhoneFigure3Endpoint>(0);
  const activationGenerationRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const pausedRef = useRef(false);
  const disposedRef = useRef(false);

  const reportFailure = useCallback((code: string, error: unknown) => {
    const binding = bindingRef.current;
    if (!binding || disposedRef.current) return;
    binding.reports.reportFailure({
      code,
      message: error instanceof Error ? error.message : String(error),
      recoverable: true
    });
  }, []);

  const commitPresentedFrame = useCallback((
    endpoint: PhoneFigure3Endpoint,
    progress: number,
    binding: PhoneLeafGenerationBinding
  ) => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || disposedRef.current || binding !== bindingRef.current) return;
    canvas.dataset.phoneFigure3PaperEndpoint = endpoint === 1 ? 'terminal' : 'initial';
    root.dataset.phoneFigure3PaperCompositor = 'ready';
    root.dataset.phoneMediaState = 'ready';
    binding.reports.reportFrame('figure3-paper-canvas', {
      kind: 'frame',
      token: binding.frameToken,
      presented: true,
      frameId: `figure3-paper:${binding.frameToken}:${++frameSequenceRef.current}`,
      detail: { compositorDrawn: true, progress }
    });
  }, []);

  const reportPresentedFrame = useCallback(() => {
    const video = videoRef.current;
    const binding = bindingRef.current;
    if (!video || !binding || disposedRef.current) return;
    const progress = progressRef.current;
    const endpoint = progress <= .001 ? 0 : progress >= .999 ? 1 : null;
    if (endpoint === null || !phoneFigure3EndpointIsPresented(
      endpoint, video.currentTime, video.readyState, video.seeking
    )) return;
    commitPresentedFrame(endpoint, progress, binding);
  }, [commitPresentedFrame]);

  const currentRunId = useCallback((direction = directionRef.current) => {
    return `${bindingRef.current?.frameToken ?? 'phone-story:unbound'}:figure3:${direction}`;
  }, []);

  const render = useCallback((rawProgress: number) => {
    const progress = clamp(rawProgress);
    if (progress > progressRef.current + .0001) directionRef.current = 1;
    if (progress < progressRef.current - .0001) directionRef.current = -1;
    progressRef.current = progress;
    const frame = phoneFigure3Frame(progress);
    const root = rootRef.current;
    renderFigure3AnimationProgress(sceneRef.current, progress, {
      mediaRun: { runId: currentRunId(), direction: directionRef.current }
    });
    if (!root) return;
    root.style.setProperty('--phone-figure3-video-opacity', frame.videoOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-video-scale', frame.videoScale.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-opacity', frame.backdropOpacity.toFixed(4));
    root.style.setProperty('--phone-figure3-backdrop-scale', frame.backdropScale.toFixed(4));
    root.dataset.phoneFigure3Progress = frame.progress.toFixed(4);
    root.dataset.phoneFigure3FallbackEndpoint = progress >= .999 ? 'terminal' : 'initial';
  }, [currentRunId]);

  const prepareCurrentFrame = useCallback(async (
    generation: number,
    binding: PhoneLeafGenerationBinding,
    direction: 1 | -1
  ) => {
    const video = videoRef.current;
    const compositor = compositorRef.current;
    if (!video || !compositor) throw new Error('Figure3 persistent compositor unavailable');
    const progress = progressRef.current;
    const endpoint = progress <= .001 ? 0 : progress >= .999 ? 1 : null;
    const result = await prepareTimelineVideoFrame(video, figure3TimelineMediaInput(
      `${binding.frameToken}:figure3:${direction}`,
      direction,
      progress
    ));
    if (disposedRef.current || generation !== activationGenerationRef.current
      || binding !== bindingRef.current || result?.status !== 'ready') return false;
    if (endpoint === null) return false;
    const proofSequence = frameSequenceRef.current;
    if (!compositor.paint()) {
      throw new Error('Figure3 decoded frame was not painted');
    }
    if (frameSequenceRef.current === proofSequence) {
      commitPresentedFrame(endpoint, progress, binding);
    }
    return true;
  }, [commitPresentedFrame]);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      frameSequenceRef.current = 0;
      const currentEndpoint = progressRef.current <= .001 ? 0
        : progressRef.current >= .999 ? 1 : null;
      const wasPaused = pausedRef.current;
      pausedRef.current = false;
      const endpoint = currentEndpoint ?? settledEndpointRef.current;
      if (wasPaused && currentEndpoint === null) render(endpoint);
      compositorRef.current?.paint();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && phoneFigure3HasReusableEndpointFrame(
        video, canvas, endpoint
      )) {
        reportPresentedFrame();
      } else if (wasPaused) {
        const generation = ++activationGenerationRef.current;
        // Runtime rebinds the retained topology and invokes activation in the
        // same physical-gesture stack. Defer recovery preparation by one
        // microtask so that activation can become the sole causal frame owner;
        // standalone lifecycle rebinds still prepare on that next microtask.
        void Promise.resolve().then(() => {
          if (disposedRef.current || generation !== activationGenerationRef.current
            || binding !== bindingRef.current) return;
          return prepareCurrentFrame(generation, binding, directionRef.current);
        }).catch((error) => {
          if (!disposedRef.current && generation === activationGenerationRef.current
            && binding === bindingRef.current) {
            reportFailure('figure3-frame-preparation-failed', error);
          }
        });
      }
    },
    activate(command): PhoneActivationInvocation {
      const expected = ['figure3-video'];
      const video = videoRef.current;
      const binding = bindingRef.current;
      if (!video || !binding || command.surfaceIds.length !== 1
        || command.surfaceIds[0] !== expected[0] || disposedRef.current) {
        return {
          invocationId: command.invocationId,
          surfaceIds: command.surfaceIds,
          invoked: false,
          settlements: []
        };
      }
      const generation = ++activationGenerationRef.current;
      let playback: Promise<void>;
      try {
        playback = Promise.resolve(video.play());
      } catch (error) {
        playback = Promise.reject(error);
      }
      const settled = playback.then(async () => {
        if (generation !== activationGenerationRef.current || disposedRef.current) {
          throw new Error('Figure3 activation was superseded before frame preparation');
        }
        video.pause();
        if (!await prepareCurrentFrame(generation, binding, directionRef.current)) {
          throw new Error('Figure3 activation was superseded before frame preparation');
        }
      });
      return {
        invocationId: command.invocationId,
        surfaceIds: expected,
        invoked: true,
        settlements: [{ surfaceId: expected[0]!, status: 'pending', settled }]
      };
    },
    render,
    settle(endpoint) {
      settledEndpointRef.current = endpoint;
      directionRef.current = endpoint === 0 ? -1 : 1;
      render(endpoint);
      const binding = bindingRef.current;
      if (!binding || disposedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      compositorRef.current?.paint();
      if (video && canvas && phoneFigure3HasReusableEndpointFrame(
        video, canvas, endpoint
      )) {
        reportPresentedFrame();
        return;
      }
      const generation = ++activationGenerationRef.current;
      void prepareCurrentFrame(generation, binding, directionRef.current)
        .catch((error) => reportFailure('figure3-frame-preparation-failed', error));
    },
    pause() {
      pausedRef.current = true;
      activationGenerationRef.current += 1;
      const video = videoRef.current;
      if (video) {
        video.pause();
        disposeTimelineVideoDriver(video);
      }
    },
    dispose() {
      if (disposedRef.current) return;
      disposedRef.current = true;
      pausedRef.current = false;
      activationGenerationRef.current += 1;
      compositorRef.current?.dispose();
      compositorRef.current = null;
      releasePhoneFigure3Video(videoRef.current);
      releasePhoneFigure3PaperCanvas(canvasRef.current);
      bindingRef.current = null;
    }
  }), [prepareCurrentFrame, render, reportFailure, reportPresentedFrame]);

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'field') sceneRef.current = element;
    if (name === 'figure3-video') videoRef.current = element as HTMLVideoElement | null;
  }, []);

  useLayoutEffect(() => {
    const mountRoot = mountRootRef.current;
    const root = rootRef.current;
    const scene = sceneRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!mountRoot || !root || !scene || !video || !canvas) return;
    disposedRef.current = false;
    pausedRef.current = false;
    root.dataset.phoneFigure3PaperCompositor = 'preparing';
    root.dataset.phoneMediaState = 'preparing';
    const compositor = createPhoneFigure3PaperCompositor({
      video,
      canvas,
      onPresentedFrame: reportPresentedFrame
    });
    compositorRef.current = compositor;
    render(0);
    reports.registerMount({
      root: mountRoot,
      surfaces: [
        { id: 'figure3-video', element: video, kind: 'video' },
        { id: 'figure3-paper-canvas', element: canvas, kind: 'canvas-2d' }
      ],
      commands
    });
    return () => {
      disposedRef.current = true;
      activationGenerationRef.current += 1;
      compositor.dispose();
      if (compositorRef.current === compositor) compositorRef.current = null;
      releasePhoneFigure3Video(video);
      bindingRef.current = null;
      sceneRef.current = null;
      videoRef.current = null;
      canvasRef.current = null;
    };
  }, [commands, render, reportPresentedFrame, reports]);

  return (
    <div ref={mountRootRef} className="phone-figure3__mount">
      <section
        ref={rootRef}
        className="phone-figure3"
        data-phone-scene="figure3-animation"
        data-phone-media-owner="figure3-motion"
        data-phone-media-state="preparing"
        aria-hidden="true"
      >
        <div className="phone-figure3__fallback" data-phone-media-fallback="figure3" />
        <Figure3Surface
          scene="figure3-animation"
          hidden={false}
          registerHandle={registerHandle}
        />
        <canvas
          ref={canvasRef}
          className="phone-figure3__paper-canvas"
          data-phone-figure3-paper-canvas
          aria-hidden="true"
        />
      </section>
    </div>
  );
}

export default PhoneFigure3;
export const phoneSceneId = 'figure3-animation' as const;
