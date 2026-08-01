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
  AOD_FIGURE_END_SECONDS,
  AOD_PHONE_TIMELINE_ALPHA_END,
  AOD_PHONE_TIMELINE_ALPHA_START,
  aodAnimationScene,
  renderAodTransitionProgress
} from '..';
import './PhoneAod.css';

const AOD_FIGURE_PACKED_ALPHA_VIDEO = phoneMediaUrlFor(
  'aod-figure-packed', 'aod-animation'
);
const AodScene = aodAnimationScene.Component;
export const PHONE_AOD_ALPHA_END_PROGRESS = AOD_PHONE_TIMELINE_ALPHA_END;
export const PHONE_AOD_ALPHA_START_PROGRESS = AOD_PHONE_TIMELINE_ALPHA_START;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
}

function renderPhoneAod(root: HTMLElement, rawProgress: number): void {
  const progress = clamp(rawProgress);
  const transition = root.querySelector<HTMLElement>('[data-aod-transition]');
  if (!transition) return;
  root.dataset.portraitAodAlpha = progress < PHONE_AOD_ALPHA_END_PROGRESS
    ? 'transparent' : 'opaque';
  root.dataset.portraitAodProgress = progress.toFixed(4);
  renderAodTransitionProgress(
    root, progress, PHONE_AOD_ALPHA_END_PROGRESS, PHONE_AOD_ALPHA_START_PROGRESS
  );
  const coverProgress = smoothstep(progress / 0.72);
  const mistProgress = smoothstep(
    (progress - PHONE_AOD_ALPHA_START_PROGRESS)
      / (0.68 - PHONE_AOD_ALPHA_START_PROGRESS)
  );
  const cloudProgress = smoothstep(progress / 0.38);
  const sunProgress = smoothstep(progress / 0.47);
  transition.style.setProperty('--aod-transition-sun-y', `${(-108 * sunProgress).toFixed(2)}dvh`);
  transition.style.setProperty('--aod-transition-cloud-y', `${(-124 * cloudProgress).toFixed(2)}dvh`);
  transition.style.setProperty('--portrait-aod-figure-cover-scale', (1 + coverProgress * 0.46).toFixed(4));
  transition.style.setProperty('--portrait-aod-figure-shift-y', '9.00dvh');
  const canonicalMist = Number.parseFloat(
    transition.style.getPropertyValue('--aod-transition-bottom-mist-opacity')
  ) || 0;
  transition.style.setProperty(
    '--aod-transition-bottom-mist-opacity',
    Math.max(canonicalMist, mistProgress * 0.96).toFixed(4)
  );
  transition.dataset.portraitAodBackdropProgress = progress.toFixed(4);
  transition.setAttribute('data-aod-exit-active', 'true');
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<PhonePackedAlphaSurface | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const surfaceGenerationRef = useRef(0);
  const frameSequenceRef = useRef(0);
  const disposedRef = useRef(false);

  const reportFailure = useCallback((failure: PhonePackedAlphaSurfaceFailure) => {
    if (failure.generation < surfaceGenerationRef.current || disposedRef.current) return;
    surfaceGenerationRef.current = failure.generation;
    bindingRef.current?.reports.reportFailure({
      code: `aod-${failure.code}`,
      message: failure.message,
      recoverable: true,
      detail: { generation: failure.generation }
    });
  }, []);

  const render = useCallback((progress: number) => {
    const root = rootRef.current;
    if (root) renderPhoneAod(root, progress);
  }, []);

  const commands = useMemo(() => {
    const commandHandle: PhoneAodMigrationCommands = {
      rebind(binding) {
        bindingRef.current = binding;
        frameSequenceRef.current = 0;
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
        const generation = surface.activate('forward');
        surfaceGenerationRef.current = generation;
        let settled: Promise<void>;
        try {
          settled = Promise.resolve(video.play()).then(() => {
            if (generation !== surfaceGenerationRef.current || !surface.render()) {
              throw new Error('AOD compositor did not present the activated frame');
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
      },
      dispose() {
        disposedRef.current = true;
        surfaceGenerationRef.current = 0;
        surfaceRef.current?.dispose('terminal');
        surfaceRef.current = null;
        bindingRef.current = null;
      },
      [PHONE_AOD_MIGRATION_CONTROL]: {
        enter() {
          // Old formal activation still enters through the same closed method.
          const invocation = commandHandle.activate({
            invocationId: 'legacy-aod:enter',
            surfaceIds: ['aod-figure-video'],
            credit: 'physical-epoch'
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
            credit: 'physical-epoch'
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
  }, [render]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const video = root?.querySelector<HTMLVideoElement>('[data-aod-figure-video]');
    const canvas = root?.querySelector<HTMLCanvasElement>('[data-aod-figure-canvas]');
    const container = canvas?.parentElement;
    if (!root || !video || !canvas || !container) return;
    disposedRef.current = false;
    videoRef.current = video;
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
        canvasSurface
      ],
      commands
    });
    return () => {
      disposedRef.current = true;
      surfaceGenerationRef.current = 0;
      surface.dispose('reactivatable');
      if (surfaceRef.current === surface) surfaceRef.current = null;
      videoRef.current = null;
      canvasRef.current = null;
      bindingRef.current = null;
      delete root.dataset.portraitAodAlpha;
      delete root.dataset.portraitAodProgress;
    };
  }, [commands, render, reportFailure, reports]);

  return (
    <div
      ref={rootRef}
      className="portrait-scroll-spike__scene portrait-scroll-spike__scene--aod"
      aria-hidden="true"
    >
      <AodScene scene="aod-animation" hidden={false} />
    </div>
  );
}

export default PhoneAod;
