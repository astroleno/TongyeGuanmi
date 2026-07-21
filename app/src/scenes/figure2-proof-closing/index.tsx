import type { SceneComponentProps, SceneModule } from '../../story/types';

export const FIGURE2_PROOF_CLOSING_LEAD = '同野观幂做第四种：';
export const FIGURE2_PROOF_CLOSING_TAIL_LINES = [
  '先进现场，',
  '再定章法，',
  '陪你跑到账上有数。'
] as const;
export const FIGURE2_PROOF_CLOSING_TAIL = FIGURE2_PROOF_CLOSING_TAIL_LINES.join('');
export const FIGURE2_PROOF_CLOSING_COPY = [
  `${FIGURE2_PROOF_CLOSING_LEAD}${FIGURE2_PROOF_CLOSING_TAIL}`
] as const;

export function Figure2ProofClosingCopy() {
  return (
    <>
      <span>{FIGURE2_PROOF_CLOSING_LEAD}</span>
      <br />
      <span className="r4-proof-closing__tail">
        {FIGURE2_PROOF_CLOSING_TAIL_LINES.map((line) => (
          <span className="r4-proof-closing__tail-line" key={line}>{line}</span>
        ))}
      </span>
    </>
  );
}

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
  return { progress: clamped, opacity, y };
}

export function renderProofClosingHold(root: HTMLElement | null): void {
  renderProofClosingProgress(root, 1);
}

function Figure2ProofClosingScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
      }}
      className="r4-proof r4-proof-page r4-proof-closing"
      data-r4-scene="figure2-proof-closing"
      data-r4-proof-overlay="closing"
    >
      <div className="r4-proof-scroll__content r4-proof-scroll__content--closing">
        <p className="r4-proof-closing__copy"><Figure2ProofClosingCopy /></p>
      </div>
    </article>
  );
}

export const figure2ProofClosingScene: SceneModule = {
  id: 'figure2-proof-closing',
  Component: Figure2ProofClosingScene,
  renderHold: renderProofClosingHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: FIGURE2_PROOF_CLOSING_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
