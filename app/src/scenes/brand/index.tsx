import type { SceneComponentProps, SceneModule } from '../../story/types';

export const BRAND_COPY = [
  '同野',
  '在开放真实的场域中并肩协作。',
  '“同野”取自《易经》“同人于野”。AI 转型，难的从来不是买工具。方向怎么定、中层怎么带、一线怎么用，得理出一条线。',
  '观幂',
  '看见复杂系统背后的结构与门道。',
  '我们不爱炫技术。我们在意的是 AI 在你的生意里能不能让人看得懂、用得顺、长久用下去，而不是热闹三个月就没人提了。'
] as const;

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
