import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { PhoneFigure2Arch } from './PhoneFigure2Arch';
import './PhoneFigure2.css';

const Figure2Surface = figure2AnimationScene.Component;
const FIGURE2_PACKED_ALPHA_VIDEO = phoneMediaUrlFor(
  'figure2-pair-packed', 'figure2-animation'
);
const FIGURE2_POSTER_IMAGE = phoneMediaUrlFor(
  'figure2-pair-poster', 'figure2-animation'
);
const FIGURE2_ENDPOINT_SECONDS = 2.6;

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

/** Genuine Figure2 leaf with one decoded source, one visible Canvas, and one retained arch. */
export function PhoneFigure2({ reports }: PhoneFigure2Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const surfaceGenerationRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const progressRef = useRef(0);
  const posterReadyRef = useRef(false);
  const reportedPosterTokenRef = useRef<string | null>(null);
  const disposedRef = useRef(false);
  const [posterHost, setPosterHost] = useState<HTMLElement | null>(null);

  const reportFailure = useCallback((failure: PhonePackedAlphaSurfaceFailure) => {
    if (disposedRef.current || failure.generation < surfaceGenerationRef.current) return;
    surfaceGenerationRef.current = failure.generation;
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

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      frameSequenceRef.current = 0;
      reportedPosterTokenRef.current = null;
      reportPoster();
    },
    activate(command): PhoneActivationInvocation {
      const expected = ['figure2-pair-video'];
      const surface = surfaceRef.current;
      const video = videoRef.current;
      if (!surface || !video || command.surfaceIds.length !== 1
        || command.surfaceIds[0] !== expected[0]) return {
        invocationId: command.invocationId,
        surfaceIds: command.surfaceIds,
        invoked: false,
        settlements: []
      };
      const generation = surface.activate(progressRef.current >= .999 ? 'endpoint' : 'forward');
      surfaceGenerationRef.current = generation;
      let settled: Promise<void>;
      try {
        settled = Promise.resolve(video.play()).then(() => {
          if (generation !== surfaceGenerationRef.current || disposedRef.current) return;
          if (!command.playback) video.pause();
        });
      } catch (error) {
        settled = Promise.reject(error);
      }
      return {
        invocationId: command.invocationId,
        surfaceIds: expected,
        invoked: generation > 0,
        settlements: generation > 0
          ? [{ surfaceId: expected[0]!, status: 'pending', settled }]
          : []
      };
    },
    render,
    settle() { render(0); },
    pause() {
      surfaceGenerationRef.current = 0;
      surfaceRef.current?.release();
      parkFigure2Media(sceneRef.current);
    },
    dispose() {
      disposedRef.current = true;
      surfaceGenerationRef.current = 0;
      surfaceRef.current?.dispose('terminal');
      surfaceRef.current = null;
      disposeFigure2Media(sceneRef.current);
      bindingRef.current = null;
    }
  }), [render, reportPoster]);

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
    const arch = root?.querySelector<HTMLImageElement>('[data-stage-retained-figure2-arch="true"]');
    if (!root || !scene || !video || !poster || !canvas || !container || !arch) return;
    disposedRef.current = false;
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
      onCanvasRenewed: (renewed) => { canvasRef.current = renewed; },
      onFrame: ({ canvas: drawnCanvas, generation }) => {
        const binding = bindingRef.current;
        if (!binding || disposedRef.current || generation !== surfaceGenerationRef.current
          || drawnCanvas !== canvasRef.current) return;
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
        { id: 'figure2-foreground-arch', element: arch, kind: 'image' }
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
      <PhoneFigure2Arch />
    </div>
  );
}

export default PhoneFigure2;
export const phoneSceneId = 'figure2-animation' as const;
