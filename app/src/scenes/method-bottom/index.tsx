import type { SceneComponentProps, SceneModule } from '../../story/types';
import { METHOD_TOP_COPY } from '../method-top';

export const METHOD_BOTTOM_COPY = [
  '01',
  '识场',
  '先摸清最耗人、最容易断的环节：老师傅一走就带走的本事，先理出来；哪笔钱花得冤，先算清楚。不瞎铺摊子。',
  '02',
  '立法',
  '给团队定一套能看懂、敢用的规矩。怎么问 AI、什么能信、哪些数据碰不得，先讲清楚，团队才敢用，也不乱用。',
  '03',
  '共创',
  '拉上你、你的中层和一线老员工一起设计。流程得让一线认账，不然做得再漂亮也推不动。',
  '04',
  '成器',
  '把摸索出来的东西沉淀成模板、专属 AI 助手、知识库和自动流程。人走了，本事留在公司里。',
  '05',
  '陪跑',
  '交付完不是结束。我们盯着用没用、好不好用，持续调、持续教，直到 AI 长进团队的日常。'
] as const;

const METHOD_STEPS = [
  { index: METHOD_BOTTOM_COPY[0], title: METHOD_BOTTOM_COPY[1], body: METHOD_BOTTOM_COPY[2] },
  { index: METHOD_BOTTOM_COPY[3], title: METHOD_BOTTOM_COPY[4], body: METHOD_BOTTOM_COPY[5] },
  { index: METHOD_BOTTOM_COPY[6], title: METHOD_BOTTOM_COPY[7], body: METHOD_BOTTOM_COPY[8] },
  { index: METHOD_BOTTOM_COPY[9], title: METHOD_BOTTOM_COPY[10], body: METHOD_BOTTOM_COPY[11] },
  { index: METHOD_BOTTOM_COPY[12], title: METHOD_BOTTOM_COPY[13], body: METHOD_BOTTOM_COPY[14] }
] as const;

export type MethodBottomRenderState = {
  progress: number;
  rowOpacity: number;
  rowY: number;
};

export function renderMethodBottomProgress(root: HTMLElement | null, progress: number): MethodBottomRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const rowOpacity = clamped;
  const rowY = (1 - clamped) * 28;
  root?.style.setProperty('--r4-method-bottom-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-method-bottom-row-opacity', rowOpacity.toFixed(4));
  root?.style.setProperty('--r4-method-bottom-row-y', `${rowY.toFixed(2)}px`);
  root?.setAttribute('data-method-bottom-progress', clamped.toFixed(4));
  return { progress: clamped, rowOpacity, rowY };
}

function MethodBottomScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
        renderMethodBottomProgress(element, 1);
      }}
      className="r4-method-bottom"
      data-r4-scene="method-bottom"
    >
      <div className="r4-method-bottom__layout">
        <div className="r4-method-bottom__lead" aria-label="方法首屏重点延续">
          <span className="section-index">{METHOD_TOP_COPY[0]}</span>
          <h2>
            <span>{METHOD_TOP_COPY[1]}</span>
            <span>{METHOD_TOP_COPY[2]}</span>
          </h2>
          <p>{METHOD_TOP_COPY[3]}</p>
          <div className="r4-method-bottom__brief" aria-label="方法首屏重点">
            <span><b>{METHOD_TOP_COPY[4]}</b>{METHOD_TOP_COPY[5]}</span>
            <span><b>{METHOD_TOP_COPY[6]}</b>{METHOD_TOP_COPY[7]}</span>
          </div>
        </div>
        <ol className="r4-method-bottom__list" aria-label="AI 落地五步">
          {METHOD_STEPS.map((step) => (
            <li key={step.index} className="r4-method-bottom__row">
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
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: METHOD_BOTTOM_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
