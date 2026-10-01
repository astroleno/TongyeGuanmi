import { useRef } from 'react';
import { SiteFooter } from '../../components/SiteFooter';
import { SITE_META } from '../../content/site-meta';
import type { SceneComponentProps, SceneModule } from '../../story/types';
import {
  createPaperEntranceLifecycle,
  type PaperEntranceRenderState,
  type PaperEntranceState
} from '../shared/paperEntrance';

export const CONTACT_COPY = [
  'START FROM THE FIELD',
  '把你拿不准的那个决定，先拿出来聊。',
  '带上一个正在耗人耗钱的环节、一场谈不拢的管理层会，或者孩子的留学规划。我们先帮你拆成看得懂、落得了地的下一步。一次现场诊断你会拿到三样东西：哪个环节值得上 AI、先后顺序、大概要投入多少。真要做，也是先挑一个环节小做，几天内见到能跑的东西，再谈要不要扩大。聊完再决定要不要合作，不推销、不卖课。',
  '约一次 AI 现场诊断',
  '回到首屏'
] as const;

export type ContactRenderState = PaperEntranceRenderState;
export type ContactEntranceState = PaperEntranceState;

const contactEntrance = createPaperEntranceLifecycle('contact', 20);
export const renderContactProgress = contactEntrance.renderProgress;
export const renderContactEntrance = contactEntrance.renderEntrance;
export const releaseContactEntrance = contactEntrance.release;
export const renderContactHold = contactEntrance.renderHold;

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
          <a className="btn btn-primary" href={SITE_META.contact.mailto}>{CONTACT_COPY[3]}</a>
          <a className="text-link" href={SITE_META.contact.mailto}>{SITE_META.contact.email}</a>
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
