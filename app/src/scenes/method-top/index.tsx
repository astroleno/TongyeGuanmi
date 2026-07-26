import { METHOD_COPY, METHOD_STEPS_COPY, METHOD_TOP_COPY } from '../../story/manifest';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export { METHOD_COPY, METHOD_STEPS_COPY, METHOD_TOP_COPY } from '../../story/manifest';

const METHOD_STEPS = [
  { index: METHOD_STEPS_COPY[0], title: METHOD_STEPS_COPY[1], body: METHOD_STEPS_COPY[2] },
  { index: METHOD_STEPS_COPY[3], title: METHOD_STEPS_COPY[4], body: METHOD_STEPS_COPY[5] },
  { index: METHOD_STEPS_COPY[6], title: METHOD_STEPS_COPY[7], body: METHOD_STEPS_COPY[8] },
  { index: METHOD_STEPS_COPY[9], title: METHOD_STEPS_COPY[10], body: METHOD_STEPS_COPY[11] },
  { index: METHOD_STEPS_COPY[12], title: METHOD_STEPS_COPY[13], body: METHOD_STEPS_COPY[14] }
] as const;

function methodRoot(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="method-top"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="method-top"]') ?? null;
}

export function renderMethodTopEntrance(
  root: HTMLElement | null | undefined,
  progress: number
): void {
  const method = methodRoot(root);
  const clamped = Math.min(1, Math.max(0, progress));
  method?.style.setProperty('--r4-method-entrance-opacity', clamped.toFixed(4));
  method?.setAttribute(
    'data-method-entrance-visible',
    semanticBoolean(clamped > 0.001)
  );
}

export function renderMethodTopHold(root: HTMLElement | null): void {
  renderMethodTopEntrance(root, 1);
}

function MethodScene({ copyCueActive = false, registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => registerHandle?.('copy', element)}
      className="r4-method r4-method--top"
      data-r3-scene="method-top"
      data-r4-scene="method-top"
      data-reading-scrollport="true"
      data-copy-cue={semanticBoolean(copyCueActive)}
    >
      <div className="homepage-scene homepage-scene--method-field-law method-handoff-anchor" aria-hidden="true" />
      <div className="r4-method__wide">
        <div className="r4-method__wide-copy">
          <span className="section-index">{METHOD_TOP_COPY[0]}</span>
          <h2>
            <span>{METHOD_TOP_COPY[1]}</span>
            <span>{METHOD_TOP_COPY[2]}</span>
          </h2>
          <p>{METHOD_TOP_COPY[3]}</p>
        </div>
        <div className="r4-method__signals" aria-label="方法首屏重点">
          <p><b>{METHOD_TOP_COPY[4]}</b><span>{METHOD_TOP_COPY[5]}</span></p>
          <p><b>{METHOD_TOP_COPY[6]}</b><span>{METHOD_TOP_COPY[7]}</span></p>
        </div>
      </div>
      <div className="r4-method__vertical">
        <aside className="r4-method__steps-lead">
          <h2>AI 落地五步</h2>
        </aside>
        <ol className="r4-method__list" tabIndex={0} aria-label="同野观幂 AI 落地五步">
          {METHOD_STEPS.map((step) => (
            <li key={step.index} className="r4-method__row">
              <span>{step.index}</span>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

export const methodTopScene: SceneModule = {
  id: 'method-top',
  Component: MethodScene,
  renderHold: renderMethodTopHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: METHOD_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
