import { METHOD_TOP_COPY } from '../../story/manifest';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export { METHOD_COPY, METHOD_STEPS_COPY, METHOD_TOP_COPY } from '../../story/manifest';

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
  method?.setAttribute('data-method-entrance-visible', String(clamped > 0.001));
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
      data-copy-cue={String(copyCueActive)}
    >
      <div className="homepage-scene homepage-scene--method-field-law method-handoff-anchor" aria-hidden="true" />
      <div className="r4-method__layout">
        <div className="r4-method__lead" aria-label="方法重点">
          <span className="section-index">{METHOD_TOP_COPY[0]}</span>
          <h2>
            <span>{METHOD_TOP_COPY[1]}</span>
            <span>{METHOD_TOP_COPY[2]}</span>
          </h2>
          <p>{METHOD_TOP_COPY[3]}</p>
          <div className="r4-method__brief" aria-label="方法首屏重点">
            <span><b>{METHOD_TOP_COPY[4]}</b>{METHOD_TOP_COPY[5]}</span>
            <span><b>{METHOD_TOP_COPY[6]}</b>{METHOD_TOP_COPY[7]}</span>
          </div>
        </div>
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
    text: METHOD_TOP_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
