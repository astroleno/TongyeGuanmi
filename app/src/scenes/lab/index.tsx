import type { SceneComponentProps, SceneModule } from '../../story/types';
import { LAB_COPY } from './copy';
export { LAB_COPY } from './copy';

const LAB_ROWS = [
  { index: LAB_COPY[11], title: LAB_COPY[12], body: LAB_COPY[13] },
  { index: LAB_COPY[14], title: LAB_COPY[15], body: LAB_COPY[16] },
  { index: LAB_COPY[17], title: LAB_COPY[18], body: LAB_COPY[19] },
  { index: LAB_COPY[20], title: LAB_COPY[21], body: LAB_COPY[22] },
  { index: LAB_COPY[23], title: LAB_COPY[24], body: LAB_COPY[25] },
  { index: LAB_COPY[26], title: LAB_COPY[27], body: LAB_COPY[28] }
] as const;

const LAB_PROTECTED_PHRASE = '店怎么卖';
const LAB_PROTECTED_PHRASE_INDEX = LAB_COPY[2].indexOf(LAB_PROTECTED_PHRASE);

export type LabRenderState = {
  progress: number;
  opacity: number;
  y: number;
};

export function renderLabProgress(root: HTMLElement | null | undefined, progress: number): LabRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = clamped;
  const y = (1 - clamped) * 28;
  root?.style.setProperty('--r4-lab-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-lab-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-lab-y', `${y.toFixed(2)}px`);
  root?.setAttribute('data-lab-progress', clamped.toFixed(4));
  return { progress: clamped, opacity, y };
}

export function renderLabHold(root: HTMLElement | null): void {
  renderLabProgress(root, 1);
}

function LabScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
      }}
      className="r4-lab"
      data-r4-scene="lab"
      data-reading-scrollport="true"
    >
      <div className="r4-lab__wide" aria-label="AI 场景判断横屏">
        <div className="r4-lab__wide-copy">
          <h2>
            {LAB_COPY[0]} <span className="r4-lab__accent">{LAB_COPY[1]}</span>
            {LAB_COPY[2].slice(0, LAB_PROTECTED_PHRASE_INDEX)}
            <span
              className="r4-authored-phrase"
            >
              {LAB_PROTECTED_PHRASE}
            </span>
            {LAB_COPY[2].slice(LAB_PROTECTED_PHRASE_INDEX + LAB_PROTECTED_PHRASE.length)}
          </h2>
        </div>
        <div className="r4-lab__signals" aria-hidden="true">
          <span>{LAB_COPY[3]}</span>
          <b>{LAB_COPY[4]}</b>
          <span>{LAB_COPY[5]}</span>
          <b>{LAB_COPY[6]}</b>
        </div>
      </div>
      <div className="r4-lab__portrait">
        <div className="r4-lab__lead">
          <span className="section-index">{LAB_COPY[7]}</span>
          <h2>
            <span>{LAB_COPY[8]}</span>
            <span>{LAB_COPY[9]}</span>
          </h2>
          <p>{LAB_COPY[10]}</p>
        </div>
        <section className="r4-lab__screen" aria-label="AI 落地场景竖屏">
          <div className="r4-lab__list" aria-label="AI 落地场景">
            {LAB_ROWS.map((row) => (
              <article key={row.index} className="r4-lab__row">
                <span>{row.index}</span>
                <strong>{row.title}</strong>
                <p>{row.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}

export const labScene: SceneModule = {
  id: 'lab',
  Component: LabScene,
  renderHold: renderLabHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['lab'],
    text: LAB_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
