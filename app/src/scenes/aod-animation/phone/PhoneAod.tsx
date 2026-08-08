import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createPhonePackedAlphaSurface,
  type PhonePackedAlphaSurface,
  type PhonePackedAlphaSurfaceFailure
} from '../../../media/phone-packed-alpha-surface';
import { phoneMediaUrlFor } from '../../../media/phone-media';
import {
  disposeTimelineVideoDriver,
  prepareTimelineVideoFrame
} from '../../../media/timeline-video-driver';
import { browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import {
  AOD_FIGURE_END_SECONDS,
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_PHONE_TIMELINE_ALPHA_START,
  aodAnimationScene,
  mapAodTimelineToMediaProgress,
  renderAodTransitionProgress
} from '..';
import './PhoneAod.css';

const AOD_FIGURE_PACKED_ALPHA_VIDEO = phoneMediaUrlFor(
  'aod-figure-packed', 'aod-animation'
);
const AOD_FIGURE_POSTER = phoneMediaUrlFor('aod-figure-poster', 'aod-animation');
const AodScene = aodAnimationScene.Component;
export const PHONE_AOD_ALPHA_END_PROGRESS = AOD_PHONE_TIMELINE_ALPHA_END;
export const PHONE_AOD_ALPHA_START_PROGRESS = AOD_PHONE_TIMELINE_ALPHA_START;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

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
    const failed = () => { clear(); reject(new Error('AOD poster decode failed')); };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
  });
}

function renderPhoneAod(root: HTMLElement, rawProgress: number): void {
  const progress = clamp(rawProgress);
  root.dataset.portraitAodAlpha = progress < PHONE_AOD_ALPHA_END_PROGRESS
    ? 'transparent' : 'opaque';
  root.dataset.portraitAodProgress = progress.toFixed(4);
  renderAodTransitionProgress(
    root, progress, PHONE_AOD_ALPHA_END_PROGRESS, PHONE_AOD_ALPHA_START_PROGRESS
  );
}

function setAodExitActive(root: HTMLElement | null, active: boolean): void {
  const section = root?.matches('[data-aod-transition]')
    ? root
    : root?.querySelector<HTMLElement>('[data-aod-transition]') ?? null;
  if (!section) return;
  if (active) section.setAttribute('data-aod-exit-active', 'true');
  else section.removeAttribute('data-aod-exit-active');
}

type PhoneAodMigrationControl = Readonly<{
  enter(): void;
  leave(): void;
  startAutoplay(direction: 1 | -1): Promise<void>;
  resetAutoplay(): void;
}>;

/** Temporary Task 7 bridge key. Task 11 removes this with the old formal shell. */
export const PHONE_AOD_MIGRATION_CONTROL: unique symbol = Symbol(
  'phone-aod-migration-control'
);

export type PhoneAodMigrationCommands = PhoneLeafCommandHandle & Readonly<{
  [PHONE_AOD_MIGRATION_CONTROL]: PhoneAodMigrationControl;
}>;

export type PhoneAodProps = Readonly<{ reports: PhoneLeafReportPort }>;

/** Genuine AOD visual leaf; runtime exclusively owns activation and progress. */
export function PhoneAod({ reports }: PhoneAodProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const surfaceGenerationRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const posterReadyRef = useRef(false);
  const reportedPosterTokenRef = useRef<string | null>(null);
  const disposedRef = useRef(false);
  const desiredProgressRef = useRef(0);
  const desiredSequenceRef = useRef(0);
  const lastRequestedProgressRef = useRef(0);
  const mediaPreparationRef = useRef<Promise<void> | null>(null);
  const [posterHost, setPosterHost] = useState<HTMLElement | null>(null);

  const reportFailure = useCallback((failure: PhonePackedAlphaSurfaceFailure) => {
    if (failure.generation < surfaceGenerationRef.current || disposedRef.current) return;
    surfaceGenerationRef.current = failure.generation;
    delete rootRef.current?.dataset.phoneAodPlaybackFrame;
    bindingRef.current?.reports.reportFailure({
      code: `aod-${failure.code}`,
      message: failure.message,
      recoverable: true,
      detail: { generation: failure.generation }
    });
  }, []);

  const reportPreparationFailure = useCallback((error: unknown, generation: number) => {
    const binding = bindingRef.current;
    if (!binding || disposedRef.current || generation !== surfaceGenerationRef.current) return;
    binding.reports.reportFailure({
      code: 'aod-frame-preparation-failed',
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
      detail: { generation }
    });
  }, []);

  const prepareDecodedFrame = useCallback(async (
    generation: number,
    progress: number
  ): Promise<'ready' | 'stale'> => {
    const video = videoRef.current;
    const surface = surfaceRef.current;
    const binding = bindingRef.current;
    if (!video || !surface || !binding || generation !== surfaceGenerationRef.current
      || disposedRef.current) return 'stale';
    const direction = progress >= lastRequestedProgressRef.current ? 1 : -1;
    lastRequestedProgressRef.current = progress;
    const result = await prepareTimelineVideoFrame(video, {
      runId: `${binding.frameToken}:aod:${generation}`,
      direction,
      progress: clamp(progress),
      durationFallbackSeconds: AOD_FIGURE_END_SECONDS,
      startSeconds: 0,
      endSeconds: AOD_FIGURE_END_SECONDS,
      timelineDurationMs: AOD_FIGURE_END_SECONDS * 1000,
      mode: 'timeline',
      nativePlaybackDirection: 1,
      allowSeekedFrameFallback: browserPrefersHevcAlpha()
    });
    if (generation !== surfaceGenerationRef.current || disposedRef.current
      || result?.status !== 'ready') return 'stale';
    if (!surface.render()) {
      throw new Error('AOD compositor did not draw the decoded frame');
    }
    video.pause();
    return 'ready';
  }, []);

  const scheduleDecodedFrame = useCallback((progress: number): Promise<void> => {
    desiredProgressRef.current = clamp(progress);
    desiredSequenceRef.current += 1;
    if (mediaPreparationRef.current) return mediaPreparationRef.current;
    const generation = surfaceGenerationRef.current;
    if (!generation || disposedRef.current) return Promise.resolve();
    const pump = async () => {
      while (generation === surfaceGenerationRef.current && !disposedRef.current) {
        const sequence = desiredSequenceRef.current;
        const result = await prepareDecodedFrame(generation, desiredProgressRef.current);
        if (result === 'ready' && sequence === desiredSequenceRef.current) return;
        if (result === 'stale') return;
      }
    };
    const preparation = pump().catch((error: unknown) => {
      reportPreparationFailure(error, generation);
      throw error;
    }).finally(() => {
      if (mediaPreparationRef.current === preparation) mediaPreparationRef.current = null;
    });
    mediaPreparationRef.current = preparation;
    return preparation;
  }, [prepareDecodedFrame, reportPreparationFailure]);

  const render = useCallback((progress: number) => {
    const root = rootRef.current;
    if (root) renderPhoneAod(root, progress);
    // The timeline driver owns seek/compositor completion. Never treat a
    // currentTime assignment followed by an immediate WebGL upload as proof.
    // A single coalesced preparation consumes the latest reducer progress.
    void scheduleDecodedFrame(mapAodTimelineToMediaProgress(
      progress, AOD_PHONE_TIMELINE_ALPHA_END
    )).catch(() => undefined);
  }, [scheduleDecodedFrame]);

  const reportPoster = useCallback(() => {
    const binding = bindingRef.current;
    if (!posterReadyRef.current || !binding || disposedRef.current
      || reportedPosterTokenRef.current === binding.frameToken) return;
    reportedPosterTokenRef.current = binding.frameToken;
    binding.reports.reportPrepared('aod-figure-poster', {
      kind: 'image-decoded',
      token: `aod:poster:${binding.frameToken}`,
      ready: true,
      detail: { posterDecoded: true }
    });
  }, []);

  const commands = useMemo(() => {
    const commandHandle: PhoneAodMigrationCommands = {
      rebind(binding) {
        bindingRef.current = binding;
        frameSequenceRef.current = 0;
        reportedPosterTokenRef.current = null;
        desiredProgressRef.current = 0;
        desiredSequenceRef.current = 0;
        lastRequestedProgressRef.current = 0;
        reportPoster();
      },
      activate(command): PhoneActivationInvocation {
        const expected = ['aod-figure-video'];
        const video = videoRef.current;
        const surface = surfaceRef.current;
        if (!video || !surface || command.surfaceIds.length !== 1
          || command.surfaceIds[0] !== expected[0]) return {
          invocationId: command.invocationId,
          surfaceIds: command.surfaceIds,
          invoked: false,
          settlements: []
        };
        disposeTimelineVideoDriver(video);
        const activatedGeneration = surface.activate('forward');
        surfaceGenerationRef.current = activatedGeneration;
        const root = rootRef.current;
        if (root && activatedGeneration > 0) {
          root.dataset.phoneAodPlaybackFrame = 'awaiting';
          setAodExitActive(root, true);
        }
        let settled: Promise<void>;
        try {
          // Consume the trusted activation window. The timeline driver waits
          // for a decoded/compositor frame before pausing the decoder.
          const playPromise = video.play();
          settled = Promise.resolve(playPromise).then(async () => {
            if (activatedGeneration !== surfaceGenerationRef.current) {
              throw new Error('AOD activation was superseded before frame preparation');
            }
            // Prepare whichever frame the reducer most recently requested
            // (reverse entries begin from the media endpoint, forward from 0)
            // instead of forcing the forward first frame.
            await scheduleDecodedFrame(desiredProgressRef.current);
          });
        } catch (error) {
          settled = Promise.reject(error);
        }
        return {
          invocationId: command.invocationId,
          surfaceIds: expected,
          invoked: activatedGeneration > 0,
          settlements: activatedGeneration > 0
            ? [{ surfaceId: expected[0]!, status: 'pending', settled }]
            : []
        };
      },
      render,
      settle(endpoint) {
        render(endpoint);
        if (endpoint === 0) {
          surfaceGenerationRef.current = 0;
          const video = videoRef.current;
          if (video) disposeTimelineVideoDriver(video);
          surfaceRef.current?.release();
          delete rootRef.current?.dataset.phoneAodPlaybackFrame;
        }
        setAodExitActive(rootRef.current, false);
      },
      pause() {
        surfaceGenerationRef.current = 0;
        const video = videoRef.current;
        if (video) disposeTimelineVideoDriver(video);
        surfaceRef.current?.release();
        delete rootRef.current?.dataset.phoneAodPlaybackFrame;
        setAodExitActive(rootRef.current, false);
      },
      dispose() {
        disposedRef.current = true;
        surfaceGenerationRef.current = 0;
        const video = videoRef.current;
        if (video) disposeTimelineVideoDriver(video);
        surfaceRef.current?.dispose('terminal');
        surfaceRef.current = null;
        bindingRef.current = null;
        delete rootRef.current?.dataset.phoneAodPlaybackFrame;
        setAodExitActive(rootRef.current, false);
      },
      [PHONE_AOD_MIGRATION_CONTROL]: {
        enter() {
          // Old formal activation still enters through the same closed method.
          const invocation = commandHandle.activate({
            invocationId: 'legacy-aod:enter',
            surfaceIds: ['aod-figure-video'],
            credit: 'physical-epoch',
            playback: true
          });
          for (const settlement of invocation.settlements) {
            if (settlement.status === 'pending') void settlement.settled.catch(() => undefined);
          }
        },
        leave() {
          commandHandle.pause('outside-closure');
        },
        startAutoplay(direction) {
          if (direction === -1) {
            render(0);
            return Promise.resolve();
          }
          const invocation = commandHandle.activate({
            invocationId: 'legacy-aod:autoplay',
            surfaceIds: ['aod-figure-video'],
            credit: 'physical-epoch', playback: true
          });
          if (!invocation.invoked || invocation.settlements.some(({
            status
          }) => status === 'rejected')) {
            return Promise.reject(new Error('AOD migration activation was rejected'));
          }
          return Promise.all(invocation.settlements.flatMap((settlement) => (
            settlement.status === 'pending' ? [settlement.settled] : []
          ))).then(() => undefined);
        },
        resetAutoplay() {
          render(0);
        }
      }
    };
    return Object.freeze(commandHandle);
  }, [render, reportPoster, scheduleDecodedFrame]);

  useLayoutEffect(() => {
    setPosterHost(rootRef.current?.querySelector<HTMLElement>('[data-aod-reveal-surface]') ?? null);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const video = root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
    const poster = posterRef.current;
    const canvas = root?.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
    const container = canvas?.parentElement;
    if (!root || !video || !poster || !canvas || !container) return;
    disposedRef.current = false;
    videoRef.current = video;
    posterReadyRef.current = false;
    reportedPosterTokenRef.current = null;
    canvasRef.current = canvas;
    render(0);
    const surface = createPhonePackedAlphaSurface({
      root,
      container,
      canvas,
      video,
      packedSourceUrl: AOD_FIGURE_PACKED_ALPHA_VIDEO,
      endpointSeconds: AOD_FIGURE_END_SECONDS,
      statusDataset: 'phoneAodFrame',
      layerName: 'aod-figure',
      canvasClassName: canvas.className,
      renewCanvasAfterFailure: true,
      onCanvasRenewed: (renewed) => { canvasRef.current = renewed; },
      onFrame: ({ canvas: drawnCanvas, generation }) => {
        const binding = bindingRef.current;
        if (!binding || disposedRef.current || generation !== surfaceGenerationRef.current
          || drawnCanvas !== canvasRef.current) return;
        root.dataset.phoneAodPlaybackFrame = 'ready';
        binding.reports.reportFrame('aod-figure-canvas', {
          kind: 'frame',
          token: binding.frameToken,
          presented: true,
          frameId: `aod-packed:${generation}:${++frameSequenceRef.current}`,
          detail: { compositorDrawn: true, generation }
        });
      },
      onFailure: reportFailure
    });
    surfaceRef.current = surface;
    const canvasSurface = {
      id: 'aod-figure-canvas',
      get element() { return canvasRef.current ?? canvas; },
      kind: 'canvas-webgl' as const
    };
    reports.registerMount({
      root,
      surfaces: [
        { id: 'aod-figure-video', element: video, kind: 'video' },
        { id: 'aod-figure-poster', element: poster, kind: 'image' },
        canvasSurface
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
        code: 'aod-poster-decode-rejected',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true
      });
    });
    return () => {
      current = false;
      disposedRef.current = true;
      surfaceGenerationRef.current = 0;
      disposeTimelineVideoDriver(video);
      posterReadyRef.current = false;
      reportedPosterTokenRef.current = null;
      surface.dispose('reactivatable');
      if (surfaceRef.current === surface) surfaceRef.current = null;
      videoRef.current = null;
      posterRef.current = null;
      canvasRef.current = null;
      bindingRef.current = null;
      delete root.dataset.portraitAodAlpha;
      delete root.dataset.portraitAodProgress;
      delete root.dataset.phoneAodPlaybackFrame;
      setAodExitActive(root, false);
    };
  }, [commands, posterHost, render, reportFailure, reportPoster, reports]);

  return (
    <div
      ref={rootRef}
      className="portrait-scroll-spike__scene portrait-scroll-spike__scene--aod"
      aria-hidden="true"
    >
      <AodScene scene="aod-animation" hidden={false} />
      {posterHost ? createPortal(
        <img
          ref={posterRef}
          className="aod-transition__figure-poster"
          data-phone-aod-figure-poster
          src={AOD_FIGURE_POSTER}
          alt=""
          aria-hidden="true"
        />,
        posterHost
      ) : null}
    </div>
  );
}

export default PhoneAod;
export const phoneSceneId = 'aod-animation' as const;
