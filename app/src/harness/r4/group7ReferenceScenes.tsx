import type { SceneComponentProps, SceneModule } from '../../story/types';

const EDUCATION_REFERENCE_COPY = [
  'Education / 04',
  '你为生意请的这套 AI 打法，也能用在孩子身上。',
  '先会用',
  '资料 · 研究 · 表达',
  '再出海',
  '课堂 · 申请 · 竞争',
  '给企业家的延伸服务',
  '先会用，',
  '再出海。'
] as const;

function renderEducationReferenceProgress(root: HTMLElement | null | undefined, progress: number): void {
  const clamped = Math.min(1, Math.max(0, progress));
  root?.style.setProperty('--r4-education-ref-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-education-ref-opacity', clamped.toFixed(4));
  root?.style.setProperty('--r4-education-ref-y', `${((1 - clamped) * 28).toFixed(2)}px`);
  root?.setAttribute('data-education-progress', clamped.toFixed(4));
}

function EducationReferenceScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
        renderEducationReferenceProgress(element, 1);
      }}
      className="r4-education-ref"
      data-r4-scene="education"
      data-r4-reference-scene="true"
    >
      <div className="r4-education-ref__wide" aria-label="留学 AI 能力横屏">
        <div className="r4-education-ref__wide-copy">
          <span className="section-index">{EDUCATION_REFERENCE_COPY[0]}</span>
          <h2>{EDUCATION_REFERENCE_COPY[1]}</h2>
        </div>
        <div className="r4-education-ref__signals" aria-hidden="true">
          <span>{EDUCATION_REFERENCE_COPY[2]}</span>
          <b>{EDUCATION_REFERENCE_COPY[3]}</b>
          <span>{EDUCATION_REFERENCE_COPY[4]}</span>
          <b>{EDUCATION_REFERENCE_COPY[5]}</b>
        </div>
      </div>
      <div className="r4-education-ref__lead">
        <span className="section-index">{EDUCATION_REFERENCE_COPY[6]}</span>
        <h3>
          <span>{EDUCATION_REFERENCE_COPY[7]}</span>
          <span>{EDUCATION_REFERENCE_COPY[8]}</span>
        </h3>
      </div>
    </article>
  );
}

export const educationReferenceScene: SceneModule = {
  id: 'education',
  Component: EducationReferenceScene,
  requiredHandles: ['copy'],
  preload: () => ({ milestones: ['targetReady'] })
};
