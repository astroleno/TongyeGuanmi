import { useRef } from 'react';
import { SiteFooter } from '../../components/SiteFooter';
import type { SceneComponentProps, SceneModule } from '../../story/types';

export const CONTACT_COPY = [
  'START FROM THE FIELD',
  '把你拿不准的那个决定，先拿出来聊。',
  '带上一个正在耗人耗钱的环节、一场谈不拢的管理层会，或者孩子的留学规划。我们先帮你拆成看得懂、落得了地的下一步。一次现场诊断你会拿到三样东西：哪个环节值得上 AI、先后顺序、大概要投入多少。真要做，也是先挑一个环节小做，几天内见到能跑的东西，再谈要不要扩大。聊完再决定要不要合作，不推销、不卖课。',
  '约一次 AI 现场诊断',
  '回到首屏'
] as const;

export type ContactRenderState = {
  progress: number;
  opacity: number;
  y: number;
};

export function renderContactProgress(root: HTMLElement | null | undefined, progress: number): ContactRenderState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = clamped;
  const y = (1 - clamped) * 20;
  root?.style.setProperty('--r4-contact-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-contact-opacity', opacity.toFixed(4));
  root?.style.setProperty('--r4-contact-y', `${y.toFixed(2)}px`);
  root?.setAttribute('data-contact-progress', clamped.toFixed(4));
  return { progress: clamped, opacity, y };
}

export function renderContactHold(root: HTMLElement | null): void {
  renderContactProgress(root, 1);
}

function ContactScene({ registerHandle }: SceneComponentProps) {
  const initializedRef = useRef(false);
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
        if (element && !initializedRef.current) {
          renderContactProgress(element, 1);
          initializedRef.current = true;
        }
      }}
      className="r4-contact contact-endpoint"
      data-r4-scene="contact"
    >
      <div className="r4-contact__content">
        <span className="eyebrow">{CONTACT_COPY[0]}</span>
        <h2>{CONTACT_COPY[1]}</h2>
        <p>{CONTACT_COPY[2]}</p>
        <div className="contact-actions">
          <a className="btn btn-primary" href="mailto:contact@example.com?subject=%E5%90%8C%E9%87%8E%E8%A7%82%E5%B9%82%20AI%20%E8%AF%8A%E6%96%AD%E5%92%A8%E8%AF%A2">{CONTACT_COPY[3]}</a>
          <a className="text-link" href="#top">{CONTACT_COPY[4]}</a>
        </div>
      </div>
      <SiteFooter />
    </article>
  );
}

export const contactScene: SceneModule = {
  id: 'contact',
  Component: ContactScene,
  renderHold: renderContactHold,
  requiredHandles: ['copy'],
  staticFallback: {
    sectionIds: ['contact'],
    text: CONTACT_COPY
  },
  preload: () => ({ milestones: ['targetReady'] })
};
