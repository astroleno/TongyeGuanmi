import type { SceneComponentProps, SceneModule } from '../../story/types';

export const EDUCATION_COPY = [
  '你为生意请的这套 AI 打法，也能用在孩子身上。',
  '先会用',
  '资料 · 研究 · 表达',
  '再出海',
  '课堂 · 申请 · 竞争',
  '给企业家的延伸服务',
  '先会用，',
  '再出海。',
  '很多老板做着做着会问一句，孩子出国，是不是也该会用这些工具？答案是会。查资料、做研究、写申请、适应海外课堂，用当下的工具，准备当下的竞争。',
  '01',
  'AI 工具使用',
  '让孩子掌握一套属于自己的高效 AI 学习方法：查资料、读东西、做展示这些事先用顺手，比同龄人快一截。',
  '02',
  '研究项目',
  '把孩子的一个兴趣，做成一个拿得出手的研究项目，申请材料里就有了别人没有的东西。',
  '03',
  '申请表达',
  '把零散的经历和想法理出一条清楚的主线，让孩子的个人故事真正打动招生官。',
  '04',
  '海外学习准备',
  '提前练好大学要用的查资料、小组协作、课堂表达，出去不慌，也不掉队。'
] as const;

const EDUCATION_ROWS = [
  { index: EDUCATION_COPY[9], title: EDUCATION_COPY[10], body: EDUCATION_COPY[11] },
  { index: EDUCATION_COPY[12], title: EDUCATION_COPY[13], body: EDUCATION_COPY[14] },
  { index: EDUCATION_COPY[15], title: EDUCATION_COPY[16], body: EDUCATION_COPY[17] },
  { index: EDUCATION_COPY[18], title: EDUCATION_COPY[19], body: EDUCATION_COPY[20] }
] as const;

export type EducationRenderState = {
  progress: number;
  opacity: number;
  y: number;
};

export function renderEducationProgress(root: HTMLElement | null | undefined, progress: number): EducationRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = clamped;
  const y = (1 - clamped) * 28;
  root?.style.setProperty('--r4-education-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-education-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-education-y', `${y.toFixed(2)}px`);
  root?.setAttribute('data-education-progress', clamped.toFixed(4));
  return { progress: clamped, opacity, y };
}

export function renderEducationHold(root: HTMLElement | null): void {
  renderEducationProgress(root, 1);
}

function EducationScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
      }}
      className="r4-education"
      data-r4-scene="education"
      data-reading-scrollport="true"
    >
      <div className="r4-education__wide" aria-label="留学 AI 能力横屏">
        <div className="r4-education__wide-copy">
          <h2>{EDUCATION_COPY[0]}</h2>
        </div>
        <div className="r4-education__signals" aria-hidden="true">
          <span>{EDUCATION_COPY[1]}</span>
          <b>{EDUCATION_COPY[2]}</b>
          <span>{EDUCATION_COPY[3]}</span>
          <b>{EDUCATION_COPY[4]}</b>
        </div>
      </div>
      <div className="r4-education__vertical">
        <div className="r4-education__lead">
          <span className="section-index">{EDUCATION_COPY[5]}</span>
          <h2>
            <span>{EDUCATION_COPY[6]}</span>
            <span>{EDUCATION_COPY[7]}</span>
          </h2>
          <p>{EDUCATION_COPY[8]}</p>
        </div>
        <div className="r4-education__program" aria-label="教育服务目录">
          {EDUCATION_ROWS.map((row) => (
            <p key={row.index} className="r4-education__row">
              <span>{row.index}</span>
              <strong>{row.title}</strong>
              <em>{row.body}</em>
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

export const educationScene: SceneModule = {
  id: 'education',
  Component: EducationScene,
  renderHold: renderEducationHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['education'],
    text: EDUCATION_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
