import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
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

export type PhoneFigure2Props = Readonly<{ reports: PhoneLeafReportPort }>;

/** Genuine Figure2 leaf with one decoded source, one visible Canvas, and one retained arch. */
export function PhoneFigure2({ reports }: PhoneFigure2Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const surfaceGenerationRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const progressRef = useRef(0);
  const disposedRef = useRef(false);

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
    if (surfaceGenerationRef.current > 0) surfaceRef.current?.render();
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      frameSequenceRef.current = 0;
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
          if (generation !== surfaceGenerationRef.current || !surface.render()) {
            throw new Error('Figure2 compositor did not present the activated frame');
          }
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
  }), [render]);

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name !== 'stage') return;
    const scene = element?.closest<HTMLElement>('[data-r4-scene="figure2-animation"]') ?? null;
    sceneRef.current = scene;
    if (scene) scene.dataset.phoneRuntimeOwned = 'true';
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const scene = sceneRef.current;
    const video = scene?.querySelector<HTMLVideoElement>('[data-figure2-combined-video]');
    const canvas = scene?.querySelector<HTMLCanvasElement>('[data-figure2-packed-alpha-canvas]');
    const container = canvas?.parentElement;
    const arch = root?.querySelector<HTMLImageElement>('[data-stage-retained-figure2-arch="true"]');
    if (!root || !scene || !video || !canvas || !container || !arch) return;
    disposedRef.current = false;
    videoRef.current = video;
    canvasRef.current = canvas;
    scene.style.setProperty('--phone-figure2-poster-image', `url(${JSON.stringify(FIGURE2_POSTER_IMAGE)})`);
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
        canvasSurface,
        { id: 'figure2-foreground-arch', element: arch, kind: 'image' }
      ],
      commands
    });
    return () => {
      disposedRef.current = true;
      surfaceGenerationRef.current = 0;
      surface.dispose('terminal');
      if (surfaceRef.current === surface) surfaceRef.current = null;
      disposeFigure2Media(scene);
      scene.style.removeProperty('--phone-figure2-poster-image');
      delete scene.dataset.phoneRuntimeOwned;
      videoRef.current = null;
      canvasRef.current = null;
      bindingRef.current = null;
    };
  }, [commands, render, reportFailure, reports]);

  return (
    <div ref={rootRef} className="phone-figure2" data-testid="r2-stage">
      <Figure2Surface
        scene="figure2-animation"
        hidden={false}
        registerHandle={registerHandle}
      />
      <PhoneFigure2Arch />
    </div>
  );
}

export default PhoneFigure2;
