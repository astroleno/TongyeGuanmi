import { useLayoutEffect, useMemo, useRef, type ComponentType } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';
import type { InkFieldFrame, InkFieldSpec } from './inkField';
import { createInkFieldFrame } from './inkField';
import {
  createInkFieldRenderer,
  type InkGradePreset,
  type InkRendererFailure,
  type InkFieldRenderer
} from './sceneInk';

export type PhoneInkLeafOptions = Readonly<{
  segmentId: string;
  surfaceId: `fx:${string}`;
  field: InkFieldSpec | ((viewport: Readonly<{ width: number; height: number }>) => InkFieldSpec);
  grade: InkGradePreset;
  mapProgress?: (progress: number) => number;
  canvasClassName?: string;
  portraitInk?: string;
}>;

function viewportFor(canvas: HTMLCanvasElement): Readonly<{ width: number; height: number }> {
  const bounds = canvas.getBoundingClientRect();
  return {
    width: Math.max(1, bounds.width || canvas.clientWidth || window.innerWidth),
    height: Math.max(1, bounds.height || canvas.clientHeight || window.innerHeight)
  };
}

function fieldFor(
  options: PhoneInkLeafOptions,
  viewport: Readonly<{ width: number; height: number }>
): InkFieldSpec {
  return typeof options.field === 'function' ? options.field(viewport) : options.field;
}

function setEffectVisible(canvas: HTMLCanvasElement | null, visible: boolean): void {
  if (!canvas) return;
  canvas.style.visibility = visible ? 'visible' : 'hidden';
  canvas.style.opacity = visible ? '1' : '0';
}

function phoneInkOwnership(frame: InkFieldFrame) {
  const reveal = frame.ownership.revealClip;
  if (frame.spec.kind !== 'radial' || !reveal) return frame.ownership;
  const match = /^circle\((.+) at (.+)\)$/.exec(reveal);
  return match ? {
    ...frame.ownership,
    concealMask: `radial-gradient(circle at ${match[2]}, transparent 0 ${match[1]}, #000 ${match[1]})`
  } : frame.ownership;
}

/**
 * Stateless clean-runtime Ink leaf. Runtime owns time/progress; this component
 * owns only one React Canvas and its current visual renderer generation.
 */
export function createPhoneInkLeaf(
  options: PhoneInkLeafOptions
): ComponentType<Readonly<{ reports: PhoneLeafReportPort }>> {
  function PhoneInkLeaf({ reports }: Readonly<{ reports: PhoneLeafReportPort }>) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rendererRef = useRef<InkFieldRenderer | null>(null);
    const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
    const pendingFailureRef = useRef<InkRendererFailure | null>(null);
    const disposedRef = useRef(false);

    const reportFailure = (failure: InkRendererFailure) => {
      const binding = bindingRef.current;
      if (disposedRef.current || !binding || failure.generation !== binding.frameToken) {
        pendingFailureRef.current = failure;
        return;
      }
      pendingFailureRef.current = null;
      binding.reports.reportFailure({
        code: `${options.segmentId}-ink-${failure.reason}`,
        message: `${options.segmentId[0]?.toUpperCase() ?? ''}${options.segmentId.slice(1)} Ink renderer ${failure.reason}`,
        recoverable: true,
        detail: { generation: failure.generation }
      });
    };

    const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
      rebind(binding: PhoneLeafGenerationBinding) {
        bindingRef.current = binding;
        const renderer = rendererRef.current;
        if (!renderer || !renderer.rebindGeneration(binding.frameToken)) {
          reportFailure({ generation: binding.frameToken, reason: 'unavailable' });
          return;
        }
        const pending = pendingFailureRef.current;
        if (pending && pending.generation === binding.frameToken) reportFailure(pending);
      },
      activate(command): PhoneActivationInvocation {
        return {
          invocationId: command.invocationId,
          surfaceIds: command.surfaceIds,
          invoked: false,
          settlements: []
        };
      },
      render(rawProgress: number) {
        const progress = Math.min(1, Math.max(0,
          options.mapProgress?.(rawProgress) ?? rawProgress));
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.dataset.r4InkBoundaryProgress = progress.toFixed(4);
        const visible = progress > .002 && progress < .999;
        setEffectVisible(canvas, visible);
        const viewport = viewportFor(canvas);
        const frame = createInkFieldFrame(fieldFor(options, viewport), progress, viewport);
        if (visible) rendererRef.current?.render(frame);
        return { ownership: phoneInkOwnership(frame) };
      },
      settle() { setEffectVisible(canvasRef.current, false); },
      pause() { setEffectVisible(canvasRef.current, false); },
      dispose() {
        disposedRef.current = true;
        setEffectVisible(canvasRef.current, false);
        rendererRef.current?.destroy();
        rendererRef.current = null;
        bindingRef.current = null;
      }
    }), []);

    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      disposedRef.current = false;
      pendingFailureRef.current = null;
      setEffectVisible(canvas, false);
      const viewport = viewportFor(canvas);
      const initialField = fieldFor(options, viewport);
      const renderer = createInkFieldRenderer(canvas, {
        removeCanvasOnDestroy: false,
        loseContextOnDestroy: false,
        fieldKind: initialField.kind,
        grade: options.grade,
        generation: 'phone-story:unbound',
        onInvalidated: reportFailure
      });
      rendererRef.current = renderer;
      renderer?.prewarm(createInkFieldFrame(initialField, .003, viewport));
      reports.registerMount({
        root: canvas,
        surfaces: [{ id: options.surfaceId, element: canvas, kind: 'canvas-webgl' }],
        commands
      });
      return () => {
        disposedRef.current = true;
        renderer?.destroy();
        if (rendererRef.current === renderer) rendererRef.current = null;
        bindingRef.current = null;
        setEffectVisible(canvas, false);
      };
    }, [commands, reports]);

    return (
      <canvas
        ref={canvasRef}
        className={['r4-ink-transition-canvas', options.canvasClassName ?? '']
          .filter(Boolean).join(' ')}
        data-r4-ink-segment={options.segmentId}
        data-r4-ink-effect-only="true"
        data-portrait-ink={options.portraitInk}
        aria-hidden="true"
      />
    );
  }

  PhoneInkLeaf.displayName = `PhoneInkLeaf(${options.segmentId})`;
  return PhoneInkLeaf;
}
