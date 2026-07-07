import type { SceneComponentProps, SceneModule } from '../../story/types';

export const LAB_COPY = [
  'Scenario / 03',
  '同样一件事，有人报三万有人报三千万。我们帮你看真生意里的',
  'AI',
  '——投流怎么花、店怎么卖、车间怎么排。',
  '报价差距',
  '3万 / 3000万',
  '先看三件事',
  '投流 · 门店 · 车间',
  '落到现场',
  '先看账，',
  '再定工具。',
  '我们把场景拆成可判断的小题，不听概念，先看钱、单、人、货和流程。',
  'FIELD CHECK',
  '06 SCENES',
  '01',
  '选型与决策',
  '报价、方案、招人，分不清谁靠谱？我们陪你把账算清，你只管拍板。',
  '02',
  '知识管理',
  '老师傅一走，本事就带走了？把团队经验存成 AI 随时能调的活资产。',
  '03',
  '电商投放',
  '素材、投放、客资连成一条线，钱花出去几个小时就知道值不值，不用等一个月。',
  '04',
  '销售增长',
  '摸透客户、磨好话术、给没成交的线索自动备好材料，让销售把时间花在成单上。',
  '05',
  '运营提效',
  '天天重复的对账单、走流程、回消息，交给 AI 自动跑，省下的人去干更值钱的活。',
  '06',
  '供应链与采购',
  '比价、合同跟踪、库存预警这些琐碎盯梢，交给 AI 看着，账目更清爽。'
] as const;

const LAB_ROWS = [
  { index: LAB_COPY[14], title: LAB_COPY[15], body: LAB_COPY[16] },
  { index: LAB_COPY[17], title: LAB_COPY[18], body: LAB_COPY[19] },
  { index: LAB_COPY[20], title: LAB_COPY[21], body: LAB_COPY[22] },
  { index: LAB_COPY[23], title: LAB_COPY[24], body: LAB_COPY[25] },
  { index: LAB_COPY[26], title: LAB_COPY[27], body: LAB_COPY[28] },
  { index: LAB_COPY[29], title: LAB_COPY[30], body: LAB_COPY[31] }
] as const;

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

function LabScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
        renderLabProgress(element, 1);
      }}
      className="r4-lab"
      data-r4-scene="lab"
    >
      <div className="r4-lab__wide" aria-label="AI 场景判断横屏">
        <div className="r4-lab__wide-copy">
          <span className="section-index">{LAB_COPY[0]}</span>
          <h2>{LAB_COPY[1]} <span>{LAB_COPY[2]}</span>{LAB_COPY[3]}</h2>
        </div>
        <div className="r4-lab__signals" aria-hidden="true">
          <span>{LAB_COPY[4]}</span>
          <b>{LAB_COPY[5]}</b>
          <span>{LAB_COPY[6]}</span>
          <b>{LAB_COPY[7]}</b>
        </div>
      </div>
      <div className="r4-lab__portrait">
        <div className="r4-lab__lead">
          <span className="section-index">{LAB_COPY[8]}</span>
          <h2>
            <span>{LAB_COPY[9]}</span>
            <span>{LAB_COPY[10]}</span>
          </h2>
          <p>{LAB_COPY[11]}</p>
        </div>
        <section className="r4-lab__screen" aria-label="AI 落地场景竖屏">
          <div className="r4-lab__screen-head" aria-hidden="true">
            <span>{LAB_COPY[12]}</span>
            <span>{LAB_COPY[13]}</span>
          </div>
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
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['lab'],
    text: LAB_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
