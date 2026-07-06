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

function MethodTopScene({ copyCueActive = false, registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => registerHandle?.('copy', element)}
      className="r3-method-top method-edition-layout method-edition-layout--after-handoff"
      data-r3-scene="method-top"
      data-copy-cue={String(copyCueActive)}
    >
      <div className="homepage-scene homepage-scene--method-field-law method-handoff-anchor" aria-hidden="true" />
      <div className="chapter-intro chapter-intro--method edition-vertical-lead">
        <span className="section-index">{METHOD_TOP_COPY[0]}</span>
        <h2>
          <span>{METHOD_TOP_COPY[1]}</span>
          <span>{METHOD_TOP_COPY[2]}</span>
        </h2>
        <p>{METHOD_TOP_COPY[3]}</p>
        <div className="method-brief" aria-label="方法首屏重点">
          <span><b>{METHOD_TOP_COPY[4]}</b>{METHOD_TOP_COPY[5]}</span>
          <span><b>{METHOD_TOP_COPY[6]}</b>{METHOD_TOP_COPY[7]}</span>
        </div>
      </div>
    </article>
  );
}

export const methodTopScene: SceneModule = {
  id: 'method-top',
  Component: MethodTopScene,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['method'],
    text: METHOD_TOP_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
