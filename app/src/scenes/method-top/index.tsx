import type { SceneComponentProps, SceneModule } from '../../story/types';

export const METHOD_TOP_COPY = [
  '先识场，再立法',
  '先看懂，',
  '再用上。',
  '你的生意怎么跑，你比谁都懂。我们不重画流程，先把现场的耗损、断点和慢单找出来，再决定 AI 接到哪里。',
  '现场',
  '钱耗在哪，人卡在哪，订单为什么慢。',
  '章法',
  '什么能问，哪些能信，哪些数据碰不得。'
] as const;

export const METHOD_STEPS_COPY = [
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

export const METHOD_COPY = [...METHOD_TOP_COPY, ...METHOD_STEPS_COPY] as const;

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
  method?.setAttribute('data-method-entrance-visible', String(clamped > 0.999));
}

export function renderMethodTopHold(root: HTMLElement | null): void {
  // Method owns a user-controlled reading scroll position; settling normalizes only
  // its declared entrance channel and never touches scrollTop.
  renderMethodTopEntrance(root, 1);
}

function MethodScene({ copyCueActive = false, registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => registerHandle?.('copy', element)}
      className="r4-method"
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
        <ol
          className="r4-method__list"
          data-reading-scrollport="true"
          tabIndex={0}
          aria-label="同野观幂 AI 落地五步"
        >
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
