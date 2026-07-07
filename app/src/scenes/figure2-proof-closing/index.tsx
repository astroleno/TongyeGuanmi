import type { SceneComponentProps, SceneModule } from '../../story/types';

const NEAR_ARCH_IMAGE = new URL('../../../../assets/arch2d-alpha.png', import.meta.url).href;

export const FIGURE2_PROOF_CLOSING_COPY = [
  '同野观幂做第四种：先进现场，再定章法，陪你跑到账上有数。'
] as const;

export type ProofClosingRenderState = {
  progress: number;
  opacity: number;
  y: number;
};

export function renderProofClosingProgress(root: HTMLElement | null, progress: number): ProofClosingRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = clamped;
  const y = (1 - clamped) * 24;
  root?.style.setProperty('--r4-proof-closing-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-proof-closing-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-proof-closing-y', `${y.toFixed(2)}px`);
  root?.style.setProperty('--r4-proof-overlay-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-proof-reveal-stop', '110%');
  root?.style.setProperty('--r4-proof-reveal-edge', '134%');
  root?.style.setProperty('--r4-proof-scroll-y', '0px');
  root?.setAttribute('data-proof-closing-progress', clamped.toFixed(4));
  root?.setAttribute('data-figure2-proof-overlay-progress', clamped.toFixed(4));
  root?.setAttribute('data-figure2-retained-arch', 'true');
  return { progress: clamped, opacity, y };
}

function Figure2ProofClosingScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
        renderProofClosingProgress(element, 1);
      }}
      className="r4-proof r4-proof-page r4-proof-closing"
      data-r4-scene="figure2-proof-closing"
      data-r4-proof-overlay="closing"
    >
      <img className="r4-proof__arch" src={NEAR_ARCH_IMAGE} alt="" aria-hidden="true" />
      <div className="r4-proof-scroll__content r4-proof-scroll__content--closing">
        <p className="method-proof__closing r4-proof-closing__copy">{FIGURE2_PROOF_CLOSING_COPY[0]}</p>
      </div>
    </article>
  );
}

export const figure2ProofClosingScene: SceneModule = {
  id: 'figure2-proof-closing',
  Component: Figure2ProofClosingScene,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: FIGURE2_PROOF_CLOSING_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
