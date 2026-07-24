import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import './PhoneEducation.css';

const EDUCATION_COPY = [
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

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const EDUCATION_ROWS = [
  [9, 10, 11],
  [12, 13, 14],
  [15, 16, 17],
  [18, 19, 20]
] as const;

export function renderPhoneEducationProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number
): void {
  const progress = clamp(rawProgress);
  root?.style.setProperty('--r4-education-progress', progress.toFixed(4));
  root?.style.setProperty('--r4-education-opacity', progress.toFixed(4));
  root?.style.setProperty(
    '--r4-education-y',
    `${((1 - progress) * 28).toFixed(2)}px`
  );
  root?.setAttribute('data-education-progress', progress.toFixed(4));
}

export const renderPhoneEducationHold = (
  root: HTMLElement | null | undefined
) => renderPhoneEducationProgress(root, 1);

/**
 * Explicitly documents that document reading owns all input over Education.
 * Unit 7's scroll coordinator must consume this policy rather than attach a
 * cinematic wheel, touch, keyboard, or focus handler to the article.
 */
export const PHONE_EDUCATION_INPUT_POLICY = Object.freeze({
  wheel: 'native',
  touch: 'native',
  keyboard: 'native',
  focus: 'native'
} as const);

/** Native-flow Education article; it never creates a second scrollport. */
export const PhoneEducation = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneEducation({ onReady, reducedMotion }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);

  const render = useCallback((rawProgress: number) => {
    const progress = clamp(rawProgress);
    renderPhoneEducationProgress(
      rootRef.current,
      reducedMotion ? (progress < 0.5 ? 0 : 1) : progress
    );
  }, [reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    renderPhoneEducationHold(root);
    root.dataset.phoneEducationScroll = 'native';
    onReady?.();
    return () => {
      delete root.dataset.phoneEducationScroll;
    };
  }, [onReady]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update: render,
    enter() {
      const root = rootRef.current;
      if (!root) return;
      root.inert = false;
      root.removeAttribute('aria-hidden');
      renderPhoneEducationHold(root);
    },
    leave() {
      const root = rootRef.current;
      if (!root) return;
      root.inert = true;
      root.setAttribute('aria-hidden', 'true');
    },
    reverse() {
      const root = rootRef.current;
      if (!root) return;
      root.inert = false;
      root.removeAttribute('aria-hidden');
    },
    dispose() {}
  }), [render]);

  return (
    <div
      id="education"
      className="phone-education"
      data-phone-scene="education"
      data-phone-input-owner="native-document"
      data-phone-input-policy="wheel-touch-keyboard-focus-native"
    >
      <article
        ref={rootRef}
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
            {EDUCATION_ROWS.map(([index, title, body]) => (
              <p key={index} className="r4-education__row">
                <span>{EDUCATION_COPY[index]}</span>
                <strong>{EDUCATION_COPY[title]}</strong>
                <em>{EDUCATION_COPY[body]}</em>
              </p>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
});

export default PhoneEducation;
