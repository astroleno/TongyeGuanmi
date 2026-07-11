import { useEffect, useRef } from 'react';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const FIGURE2_PROOF_OPENING_COPY = [
  '用不上，不算落地',
  '我们见过太多',
  '“用不上”。'
] as const;

export type ProofOpeningRenderState = {
  progress: number;
  opacity: number;
  y: number;
};

export function renderProofOpeningProgress(root: HTMLElement | null, progress: number): ProofOpeningRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = clamped;
  const y = 0;
  root?.style.setProperty('--r4-proof-opening-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-proof-opening-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-proof-opening-y', `${y.toFixed(2)}px`);
  root?.style.setProperty('--r4-proof-overlay-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-proof-reveal-stop', `${(-12 + clamped * 122).toFixed(2)}%`);
  root?.style.setProperty('--r4-proof-reveal-edge', `${(2 + clamped * 132).toFixed(2)}%`);
  root?.style.setProperty('--r4-proof-scroll-y', '0px');
  root?.setAttribute('data-proof-opening-progress', clamped.toFixed(4));
  root?.setAttribute('data-figure2-proof-overlay-progress', clamped.toFixed(4));
  if (typeof root?.removeAttribute === 'function') {
    root.removeAttribute('data-figure2-retained-arch');
  }
  return { progress: clamped, opacity, y };
}

function isTransitionActive(root: HTMLElement | null): boolean {
  const layer = root?.closest<HTMLElement>('[data-stage-layer]');
  return Boolean(layer?.dataset.r4Transition || layer?.dataset.r4InkActive === 'true');
}

function initialProgressForLayer(hidden: boolean, role: SceneComponentProps['role']): number {
  return hidden || role !== 'current' ? 0 : 1;
}

function Figure2ProofOpeningScene({ hidden, role, registerHandle }: SceneComponentProps) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isTransitionActive(rootRef.current)) {
      return;
    }
    renderProofOpeningProgress(rootRef.current, initialProgressForLayer(hidden, role));
  }, [hidden, role]);

  return (
    <article
      ref={(element) => {
        rootRef.current = element;
        registerHandle?.('copy', element);
        if (element && element.dataset.proofOpeningInitialized !== 'true') {
          element.dataset.proofOpeningInitialized = 'true';
          renderProofOpeningProgress(element, initialProgressForLayer(hidden, role));
        }
      }}
      className="r4-proof r4-proof-page r4-proof-opening"
      data-r4-scene="figure2-proof-opening"
      data-r4-proof-overlay="opening"
    >
      <div className="r4-proof-scroll__content r4-proof-scroll__content--opening">
        <div className="method-proof__lead r4-proof__lead">
          <span>{FIGURE2_PROOF_OPENING_COPY[0]}</span>
          <h2 className="method-proof__closing">
            <span>{FIGURE2_PROOF_OPENING_COPY[1]}</span>
            <span>{FIGURE2_PROOF_OPENING_COPY[2]}</span>
          </h2>
        </div>
      </div>
    </article>
  );
}

export const figure2ProofOpeningScene: SceneModule = {
  id: 'figure2-proof-opening',
  Component: Figure2ProofOpeningScene,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: FIGURE2_PROOF_OPENING_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
