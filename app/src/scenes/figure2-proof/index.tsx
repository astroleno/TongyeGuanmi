import type { SceneComponentProps, SceneModule } from '../../story/types';
import {
  FIGURE2_PROOF_OPENING_COPY,
  renderProofOpeningHold
} from '../figure2-proof-opening';
import {
  FIGURE2_PROOF_CARDS_COPY,
  renderProofCardsHold
} from '../figure2-proof-cards';
import {
  Figure2ProofClosingCopy,
  FIGURE2_PROOF_CLOSING_COPY,
  renderProofClosingHold
} from '../figure2-proof-closing';

const PROOF_CARDS = [
  {
    index: FIGURE2_PROOF_CARDS_COPY[0],
    title: FIGURE2_PROOF_CARDS_COPY[1],
    body: FIGURE2_PROOF_CARDS_COPY[2]
  },
  {
    index: FIGURE2_PROOF_CARDS_COPY[3],
    title: FIGURE2_PROOF_CARDS_COPY[4],
    body: FIGURE2_PROOF_CARDS_COPY[5]
  },
  {
    index: FIGURE2_PROOF_CARDS_COPY[6],
    title: FIGURE2_PROOF_CARDS_COPY[7],
    body: FIGURE2_PROOF_CARDS_COPY[8]
  }
] as const;

function panel(root: HTMLElement | null, name: 'opening' | 'cards' | 'closing') {
  return root?.querySelector<HTMLElement>(`[data-r4-proof-panel="${name}"]`) ?? null;
}

export function renderFigure2ProofHold(root: HTMLElement | null): void {
  renderProofOpeningHold(panel(root, 'opening'));
  renderProofCardsHold(panel(root, 'cards'));
  renderProofClosingHold(panel(root, 'closing'));
}

export function figure2ProofPanelElement(
  root: HTMLElement | null,
  name: 'opening' | 'cards' | 'closing'
): HTMLElement | null {
  return panel(root, name);
}

function Figure2ProofScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => registerHandle?.('copy', element)}
      className="r4-proof r4-proof-page r4-proof-compound"
      data-r4-scene="figure2-proof"
      data-r4-proof-compound="true"
      data-reading-scrollport="true"
    >
      <section
        id="figure2-proof-opening"
        className="r4-proof-panel r4-proof-opening"
        data-r4-proof-panel="opening"
        data-r4-proof-overlay="opening"
      >
        <div className="r4-proof-scroll__content r4-proof-scroll__content--opening">
          <div className="r4-proof-opening__lead">
            <span>{FIGURE2_PROOF_OPENING_COPY[0]}</span>
            <h2 className="r4-proof-opening__title">
              <span>{FIGURE2_PROOF_OPENING_COPY[1]}</span>
              <span>{FIGURE2_PROOF_OPENING_COPY[2]}</span>
            </h2>
          </div>
        </div>
      </section>

      <section
        id="figure2-proof-cards"
        className="r4-proof-panel r4-proof-cards"
        data-r4-proof-panel="cards"
        data-r4-proof-overlay="cards"
      >
        <div className="r4-proof-scroll__content r4-proof-scroll__content--cards">
          <ol className="r4-proof-cards__list" aria-label="常见 AI 落地失败方式">
            {PROOF_CARDS.map((card) => (
              <li key={card.index} className="r4-proof-cards__row">
                <span>{card.index}</span>
                <strong>{card.title}</strong>
                <p>{card.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="figure2-proof-closing"
        className="r4-proof-panel r4-proof-closing"
        data-r4-proof-panel="closing"
        data-r4-proof-overlay="closing"
      >
        <div className="r4-proof-scroll__content r4-proof-scroll__content--closing">
          <p className="r4-proof-closing__copy">
            <Figure2ProofClosingCopy />
          </p>
        </div>
      </section>
    </article>
  );
}

export const FIGURE2_PROOF_COPY = [
  ...FIGURE2_PROOF_OPENING_COPY,
  ...FIGURE2_PROOF_CARDS_COPY,
  ...FIGURE2_PROOF_CLOSING_COPY
] as const;

export const figure2ProofScene: SceneModule = {
  id: 'figure2-proof',
  Component: Figure2ProofScene,
  renderHold: renderFigure2ProofHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: FIGURE2_PROOF_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
