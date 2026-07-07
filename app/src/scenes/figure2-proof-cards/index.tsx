import type { SceneComponentProps, SceneModule } from '../../story/types';

const NEAR_ARCH_IMAGE = new URL('../../../../assets/arch2d-alpha.png', import.meta.url).href;

export const FIGURE2_PROOF_CARDS_COPY = [
  '01',
  '只培训',
  '听完很激动，回去照旧。',
  '02',
  '只上软件',
  '账号开了，一线没人碰。',
  '03',
  '只交方案',
  '装订精美，锁进抽屉。'
] as const;

const PROOF_CARDS = [
  { index: FIGURE2_PROOF_CARDS_COPY[0], title: FIGURE2_PROOF_CARDS_COPY[1], body: FIGURE2_PROOF_CARDS_COPY[2] },
  { index: FIGURE2_PROOF_CARDS_COPY[3], title: FIGURE2_PROOF_CARDS_COPY[4], body: FIGURE2_PROOF_CARDS_COPY[5] },
  { index: FIGURE2_PROOF_CARDS_COPY[6], title: FIGURE2_PROOF_CARDS_COPY[7], body: FIGURE2_PROOF_CARDS_COPY[8] }
] as const;

export type ProofCardsRenderState = {
  progress: number;
  opacity: number;
  y: number;
};

export function renderProofCardsProgress(root: HTMLElement | null, progress: number): ProofCardsRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = clamped;
  const y = (1 - clamped) * 28;
  root?.style.setProperty('--r4-proof-cards-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-proof-cards-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-proof-cards-y', `${y.toFixed(2)}px`);
  root?.setAttribute('data-proof-cards-progress', clamped.toFixed(4));
  return { progress: clamped, opacity, y };
}

function Figure2ProofCardsScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
        renderProofCardsProgress(element, 1);
      }}
      className="r4-proof r4-proof-cards"
      data-r4-scene="figure2-proof-cards"
    >
      <img className="r4-proof__arch" src={NEAR_ARCH_IMAGE} alt="" aria-hidden="true" />
      <ol className="r4-proof-cards__list" aria-label="常见 AI 落地失败方式">
        {PROOF_CARDS.map((card) => (
          <li key={card.index} className="r4-proof-cards__row">
            <span>{card.index}</span>
            <strong>{card.title}</strong>
            <p>{card.body}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}

export const figure2ProofCardsScene: SceneModule = {
  id: 'figure2-proof-cards',
  Component: Figure2ProofCardsScene,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: FIGURE2_PROOF_CARDS_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
