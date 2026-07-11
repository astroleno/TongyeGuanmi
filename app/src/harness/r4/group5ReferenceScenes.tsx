import type { SceneComponentProps, SceneModule } from '../../story/types';

const SERVICES_REFERENCE_COPY = [
  '先小做，再扩',
  '先跑通，',
  '再铺开。',
  '不必一上来就大动干戈。先挑一个环节，几天内做出能跑的东西给你看，值不值、扩不扩，你看着实物决定。'
] as const;

function renderServicesReferenceProgress(root: HTMLElement | null | undefined, progress: number): void {
  const clamped = Math.min(1, Math.max(0, progress));
  root?.style.setProperty('--r4-services-ref-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-services-ref-opacity', clamped.toFixed(4));
  root?.style.setProperty('--r4-services-ref-y', `${((1 - clamped) * 28).toFixed(2)}px`);
  root?.setAttribute('data-services-progress', clamped.toFixed(4));
}

function ServicesReferenceScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
        renderServicesReferenceProgress(element, 1);
      }}
      className="r4-services-ref"
      data-r4-scene="services"
      data-r4-reference-scene="true"
    >
      <div className="r4-services-ref__copy">
        <span className="section-index">{SERVICES_REFERENCE_COPY[0]}</span>
        <h2>
          <span>{SERVICES_REFERENCE_COPY[1]}</span>
          <span>{SERVICES_REFERENCE_COPY[2]}</span>
        </h2>
        <p>{SERVICES_REFERENCE_COPY[3]}</p>
      </div>
    </article>
  );
}

export const servicesReferenceScene: SceneModule = {
  id: 'services',
  Component: ServicesReferenceScene,
  renderHold: (root) => renderServicesReferenceProgress(root, 1),
  requiredHandles: ['copy'],
  preload: () => ({ milestones: ['targetReady'] })
};
