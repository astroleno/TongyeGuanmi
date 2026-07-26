import type { SceneComponentProps, SceneModule } from '../../story/types';
import {
  createPaperEntranceLifecycle,
  type PaperEntranceRenderState,
  type PaperEntranceState
} from '../shared/paperEntrance';
import { SERVICES_COPY } from './copy';
export { SERVICES_COPY } from './copy';

const SERVICE_ROWS = [
  { index: SERVICES_COPY[4], title: SERVICES_COPY[5], body: SERVICES_COPY[6], detail: SERVICES_COPY[7] },
  { index: SERVICES_COPY[8], title: SERVICES_COPY[9], body: SERVICES_COPY[10], detail: SERVICES_COPY[11] },
  { index: SERVICES_COPY[12], title: SERVICES_COPY[13], body: SERVICES_COPY[14], detail: SERVICES_COPY[15] },
  { index: SERVICES_COPY[16], title: SERVICES_COPY[17], body: SERVICES_COPY[18], detail: SERVICES_COPY[19] }
] as const;

export type ServicesRenderState = PaperEntranceRenderState;
export type ServicesEntranceState = PaperEntranceState;

const servicesEntrance = createPaperEntranceLifecycle('services', 28);
export const renderServicesProgress = servicesEntrance.renderProgress;
export const renderServicesEntrance = servicesEntrance.renderEntrance;
export const releaseServicesEntrance = servicesEntrance.release;
export const renderServicesHold = servicesEntrance.renderHold;

function ServicesScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
      }}
      className="r4-services"
      data-r4-scene="services"
      data-reading-scrollport="true"
    >
      <section className="r4-services__wide" aria-label="企业服务总览">
        <div className="r4-services__wide-copy">
          <h2>
            <span>{SERVICES_COPY[1]}</span>
            <span>{SERVICES_COPY[2]}</span>
          </h2>
        </div>
        <div className="r4-services__signals" aria-hidden="true">
          {SERVICE_ROWS.map((row) => <span key={row.index}>{row.title}</span>)}
        </div>
      </section>
      <section className="r4-services__vertical" aria-label="企业服务能力">
        <aside className="r4-services__capability-lead">
          <span className="section-index">{SERVICES_COPY[0]}</span>
          <h2>企业服务能力</h2>
          <p>{SERVICES_COPY[3]}</p>
        </aside>
        <ol className="r4-services__list" aria-label="企业服务能力">
          {SERVICE_ROWS.map((row) => (
            <li key={row.index} className="r4-services__row">
              <span>{row.index}</span>
              <strong>{row.title}</strong>
              <p>{row.body}<small>{row.detail}</small></p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

export const servicesScene: SceneModule = {
  id: 'services',
  Component: ServicesScene,
  renderHold: renderServicesHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['services'],
    text: SERVICES_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
