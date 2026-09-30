import copy from '../../docs/react-refactor/inventory/copy-reference.json';
import { SEO_META } from './seo-meta';

function section(id: string): readonly string[] {
  const result = copy.sections.find((item) => item.sectionId === id);
  if (!result) throw new Error(`Missing accepted copy section: ${id}`);
  return result.normalizedText;
}

function after(items: readonly string[], label: string, offset = 1): string {
  const index = items.indexOf(label);
  const result = index < 0 ? undefined : items[index + offset];
  if (!result) throw new Error(`Missing accepted copy after: ${label}`);
  return result;
}

const serviceCopy = section('services');
const methodCopy = section('method');
export const SERVICES = SEO_META.services.map((service) => ({
  ...service,
  body: after(serviceCopy, service.name),
  details: after(serviceCopy, service.name, 2).split(' / ')
}));

export const METHOD = ['识场', '立法', '共创', '成器', '陪跑'].map((name) => ({
  name, description: after(methodCopy, name)
}));

export const FAQS = [
  {
    id: 'where-to-start',
    question: '企业 AI 转型，应该从哪里开始？',
    answer: '先找一个正在耗人耗钱、容易中断或拖慢订单的业务环节，识别 AI 可以接入的位置。先把一个环节跑通，再根据实际效果决定是否扩大，不必一开始就全面铺开。',
    sourcePath: '/#services', sourceLabel: '首页 · 服务场景'
  },
  {
    id: 'beyond-training',
    question: '同野观幂提供的只是 AI 培训吗？',
    answer: '不是。企业培训是服务的一部分，完整服务还包括 AI 转型咨询、场景共创、工具实施与陪跑。培训围绕管理层、中层和一线岗位的真实工作展开，并与业务应用和持续使用结合。',
    sourcePath: '/services/', sourceLabel: '服务说明'
  },
  {
    id: 'business-scenarios',
    question: '哪些业务场景可以一起共创？',
    answer: '现有服务覆盖销售获客与跟单、电商素材与投放复盘、核心经验与文档整理，也包括专属 AI 助手、知识库和自动流程。具体先做哪一项，要从企业的业务现场和需求出发。',
    sourcePath: '/services/#scenario-co-creation', sourceLabel: '服务说明 · 场景共创'
  },
  {
    id: 'data-boundaries',
    question: '团队使用 AI 前，如何明确数据与判断的边界？',
    answer: '先约定怎么向 AI 提问、哪些结果可以信、哪些数据不能交给 AI，以及哪些环节需要人来把关。风险与数据安全把关是咨询的一部分，团队使用规则需要在实施前讲清楚。',
    sourcePath: '/services/#method', sourceLabel: '服务说明 · 实施方法'
  },
  {
    id: 'after-delivery',
    question: '工具交付以后，还会继续陪跑吗？',
    answer: '会。工具实施与陪跑包括定期复盘优化，关注团队是否实际使用、是否用得顺手，持续调整和教学。目标是让模板、知识库、AI 助手和自动流程进入团队的日常工作。',
    sourcePath: '/services/#implementation-support', sourceLabel: '服务说明 · 工具实施与陪跑'
  },
  {
    id: 'first-diagnosis',
    question: '第一次 AI 现场诊断，会讨论什么？',
    answer: '可以带来一个正在耗人耗钱的业务环节，或一场尚未形成共识的管理层讨论。现场诊断会一起梳理哪个环节值得使用 AI、推进的先后顺序和大致投入，再决定是否合作。',
    sourcePath: '/#contact', sourceLabel: '首页 · 现场诊断'
  }
] as const;
