import { METHOD_STEPS_COPY } from '../../story/manifest';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export { METHOD_STEPS_COPY } from '../../story/manifest';

const METHOD_STEPS = [
  { index: METHOD_STEPS_COPY[0], title: METHOD_STEPS_COPY[1], body: METHOD_STEPS_COPY[2] },
  { index: METHOD_STEPS_COPY[3], title: METHOD_STEPS_COPY[4], body: METHOD_STEPS_COPY[5] },
  { index: METHOD_STEPS_COPY[6], title: METHOD_STEPS_COPY[7], body: METHOD_STEPS_COPY[8] },
  { index: METHOD_STEPS_COPY[9], title: METHOD_STEPS_COPY[10], body: METHOD_STEPS_COPY[11] },
  { index: METHOD_STEPS_COPY[12], title: METHOD_STEPS_COPY[13], body: METHOD_STEPS_COPY[14] }
] as const;

function methodBottomRoot(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="method-bottom"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="method-bottom"]') ?? null;
}

export function renderMethodBottomEntrance(
  root: HTMLElement | null | undefined,
  progress: number
): void {
  const method = methodBottomRoot(root);
  const clamped = Math.min(1, Math.max(0, progress));
  method?.style.setProperty('--r4-method-entrance-opacity', clamped.toFixed(4));
  method?.style.setProperty('--r4-method-bottom-y', `${((1 - clamped) * 20).toFixed(2)}px`);
  method?.setAttribute('data-method-entrance-visible', String(clamped > 0.001));
}

export function renderMethodBottomHold(root: HTMLElement | null): void {
  renderMethodBottomEntrance(root, 1);
}

function MethodBottomScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => registerHandle?.('copy', element)}
      className="r4-method r4-method--bottom"
      data-r4-scene="method-bottom"
      data-reading-scrollport="true"
    >
      <div className="r4-method__vertical">
        <aside className="r4-method__steps-lead">
          <span className="section-index">01—05</span>
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

export const methodBottomScene: SceneModule = {
  id: 'method-bottom',
  Component: MethodBottomScene,
  renderHold: renderMethodBottomHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: METHOD_STEPS_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
