import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort
} from '../../../production/phone-story/presentation';
import { figure2ProofScene, renderFigure2ProofHold } from '..';
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
    const viewportHeight = root.parentElement?.clientHeight || window.innerHeight || 1;
    const frame = phoneFigure2ProofFrame(rawProgress, viewportHeight);
    root.style.setProperty('--phone-proof-translate-y', `${frame.translateY.toFixed(2)}px`);
    root.dataset.phoneProofProgress = frame.progress.toFixed(4);
  }, []);

  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind(binding: PhoneLeafGenerationBinding) {
      bindingRef.current = binding;
      provePostPaint();
    },
    activate(command): PhoneActivationInvocation {
      return { invocationId: command.invocationId, surfaceIds: command.surfaceIds,
        invoked: false, settlements: [] };
    },
    render,
    settle() {
      renderFigure2ProofHold(rootRef.current);
      render(0);
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
    reports.registerMount({
      root,
      surfaces: [{ id: 'figure2-proof-root', element: root, kind: 'dom' }],
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

export default PhoneFigure2Proof;
export const phoneSceneId = 'figure2-proof' as const;
