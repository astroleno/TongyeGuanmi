import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { Figure2ProofScene, figure2ProofScene, renderFigure2ProofHold } from '..';
import './PhoneFigure2Proof.css';

const Figure2ProofSurface = figure2ProofScene.Component;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneFigure2ProofFrame(
  rawProgress: number,
  viewportHeight: number
): Readonly<{ progress: number; translateY: number }> {
  const progress = clamp(rawProgress);
  return { progress, translateY: -2 * Math.max(1, viewportHeight) * progress };
}

export function PhoneFigure2Proof({ reports }: Readonly<{ reports: PhoneLeafReportPort }>) {
  const rootRef = useRef<HTMLElement | null>(null);
  const bindingRef = useRef<PhoneLeafGenerationBinding | null>(null);
  const paintFrameRef = useRef<number | null>(null);
  const disposedRef = useRef(false);

  const cancelPaint = useCallback(() => {
    if (paintFrameRef.current !== null) cancelAnimationFrame(paintFrameRef.current);
    paintFrameRef.current = null;
  }, []);

  const provePostPaint = useCallback(() => {
    cancelPaint();
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = null;
      const binding = bindingRef.current;
      if (!binding || disposedRef.current) return;
      binding.reports.reportPrepared('figure2-proof-root', {
        kind: 'static-ready', token: binding.frameToken, ready: true,
        detail: { postPaint: true }
      });
    });
  }, [cancelPaint]);

  const render = useCallback((rawProgress: number) => {
    const root = rootRef.current;
    if (!root) return;
    const binding = bindingRef.current;
    const viewportHeight = root.parentElement?.clientHeight || window.innerHeight || 1;
    const reverseDistanceExit = binding?.segmentId === 'figure2-distance-expand'
      && binding.direction === 'reverse';
    const frame = phoneFigure2ProofFrame(reverseDistanceExit ? 1 : rawProgress, viewportHeight);
    root.style.setProperty('--phone-proof-translate-y', `${frame.translateY.toFixed(2)}px`);
    root.dataset.phoneProofProgress = frame.progress.toFixed(4);
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      if (binding.segmentId === 'figure2-distance-expand'
        && binding.direction === 'reverse') render(1);
      provePostPaint();
    },
    activate(command): PhoneActivationInvocation {
      return { invocationId: command.invocationId, surfaceIds: command.surfaceIds,
        invoked: false, settlements: [] };
    },
    render,
    settle(endpoint) {
      renderFigure2ProofHold(rootRef.current);
      render(endpoint);
    },
    pause() {},
    dispose() {
      disposedRef.current = true;
      cancelPaint();
      bindingRef.current = null;
    }
  }), [cancelPaint, provePostPaint, render]);

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name === 'copy') rootRef.current = element;
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    disposedRef.current = false;
    renderFigure2ProofHold(root);
    render(0);
    const arch = root.closest<HTMLElement>('.phone-story')?.querySelector<HTMLImageElement>(
      '[data-stage-retained-figure2-arch="true"]'
    ) ?? null;
    reports.registerMount({
      root,
      surfaces: [
        { id: 'figure2-proof-root', element: root, kind: 'dom' },
        ...(arch ? [{ id: 'figure2-foreground-arch', element: arch, kind: 'image' as const }] : [])
      ],
      commands
    });
    return () => {
      disposedRef.current = true;
      cancelPaint();
      bindingRef.current = null;
    };
  }, [cancelPaint, commands, render, reports]);

  return (
    <Figure2ProofSurface
      scene="figure2-proof"
      hidden={false}
      registerHandle={registerHandle}
    />
  );
}

export function Reading(props: Readonly<{ sceneId?: string }> = {}) {
  void props;
  return <Figure2ProofScene scene="figure2-proof" hidden={false} reading />;
}

export default PhoneFigure2Proof;
export const phoneSceneId = 'figure2-proof' as const;
