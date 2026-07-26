import type { SceneComponentProps, SceneModule } from '../../story/types';
import { BRAND_COPY } from './copy';
export { BRAND_COPY } from './copy';

export type BrandRenderState = {
  progress: number;
  opacity: number;
  y: number;
};

export function renderBrandProgress(root: HTMLElement | null, progress: number): BrandRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = clamped;
  const y = (1 - clamped) * 28;
  root?.style.setProperty('--r4-brand-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-brand-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-brand-y', `${y.toFixed(2)}px`);
  root?.setAttribute('data-brand-progress', clamped.toFixed(4));
  return { progress: clamped, opacity, y };
}

export function renderBrandHold(root: HTMLElement | null): void {
  renderBrandProgress(root, 1);
}

function BrandScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
      }}
      className="r4-brand"
      data-r4-scene="brand"
    >
      <div className="r4-brand__grid">
        <section className="r4-brand__definition">
          <span>{BRAND_COPY[0]}</span>
          <h2>{BRAND_COPY[1]}</h2>
          <p>{BRAND_COPY[2]}</p>
        </section>
        <section className="r4-brand__definition r4-brand__definition--right">
          <span>{BRAND_COPY[3]}</span>
          <h2>{BRAND_COPY[4]}</h2>
          <p>{BRAND_COPY[5]}</p>
        </section>
      </div>
    </article>
  );
}

export const brandScene: SceneModule = {
  id: 'brand',
  Component: BrandScene,
  renderHold: renderBrandHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['brand'],
    text: BRAND_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
