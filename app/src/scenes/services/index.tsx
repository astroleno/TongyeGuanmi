import type { SceneComponentProps, SceneModule } from '../../story/types';

export const SERVICES_COPY = [
  '先小做，再扩',
  '先跑通，',
  '再铺开。',
  '不必一上来就大动干戈。先挑一个环节，几天内做出能跑的东西给你看，值不值、扩不扩，你看着实物决定。',
  '01',
  'AI 转型咨询',
  '帮你理清楚哪儿该上 AI、能省多少、先动哪一步。给你一张看得懂、能落地的路线图，不是一本锁进抽屉的方案书。',
  '管理层关门对齐会 / 先动哪个环节，排清顺序 / 风险与数据安全把关',
  '02',
  '企业培训',
  '培训不按热闹算，按会不会用算。老板、中层、一线都要把 AI 用顺手，开会不再是你一个人懂、底下没人接得住。',
  '怎么把活儿交代给 AI / 哪些活交给 AI、哪些人把关 / 按岗位定制课程',
  '03',
  '场景共创',
  '把你嘴里那句“我也说不清想要啥”的模糊需求，拆成做得出、用得上、能复用的具体 AI 应用。',
  '销售获客与跟单 / 电商素材与投放复盘 / 核心经验与文档整理',
  '04',
  '工具实施与陪跑',
  '帮你搭模板、建知识库、做专属 AI 助手和自动流程，然后陪着用起来，让“装了”真的变成“在用”。',
  '专属 AI 助手搭建 / 知识库落地 / 定期复盘优化'
] as const;

const SERVICE_ROWS = [
  { index: SERVICES_COPY[4], title: SERVICES_COPY[5], body: SERVICES_COPY[6], detail: SERVICES_COPY[7] },
  { index: SERVICES_COPY[8], title: SERVICES_COPY[9], body: SERVICES_COPY[10], detail: SERVICES_COPY[11] },
  { index: SERVICES_COPY[12], title: SERVICES_COPY[13], body: SERVICES_COPY[14], detail: SERVICES_COPY[15] },
  { index: SERVICES_COPY[16], title: SERVICES_COPY[17], body: SERVICES_COPY[18], detail: SERVICES_COPY[19] }
] as const;

export type ServicesRenderState = {
  progress: number;
  opacity: number;
  y: number;
};

export function renderServicesProgress(root: HTMLElement | null | undefined, progress: number): ServicesRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = clamped;
  const y = (1 - clamped) * 28;
  root?.style.setProperty('--r4-services-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-services-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-services-y', `${y.toFixed(2)}px`);
  root?.setAttribute('data-services-progress', clamped.toFixed(4));
  return { progress: clamped, opacity, y };
}

export function renderServicesHold(root: HTMLElement | null): void {
  renderServicesProgress(root, 1);
}

function ServicesScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
      }}
      className="r4-services"
      data-r4-scene="services"
    >
      <div className="r4-services__layout">
        <div className="r4-services__lead">
          <span className="section-index">{SERVICES_COPY[0]}</span>
          <h2>
            <span>{SERVICES_COPY[1]}</span>
            <span>{SERVICES_COPY[2]}</span>
          </h2>
          <p>{SERVICES_COPY[3]}</p>
        </div>
        <ol className="r4-services__list" aria-label="企业服务能力">
          {SERVICE_ROWS.map((row) => (
            <li key={row.index} className="r4-services__row">
              <span>{row.index}</span>
              <strong>{row.title}</strong>
              <p>{row.body}<small>{row.detail}</small></p>
            </li>
          ))}
        </ol>
      </div>
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
