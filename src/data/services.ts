import type { LeadDirection } from '@/types/lead'

export type ServicePackage = {
  id: 'ai-transformation' | 'canvas-agent' | 'aigc-video' | 'personal-capability'
  direction: LeadDirection
  title: string
  subtitle: string
  audience: string
  includes: string[]
  outcome: string
  cta: string
}

export const servicePackages: ServicePackage[] = [
  {
    id: 'ai-transformation',
    direction: 'enterprise',
    title: '企业 AI 场景共创与落地陪跑',
    subtitle: '让 AI 进入团队真实工作流',
    audience: '适合管理层、HR、业务负责人、数字化负责人。',
    includes: ['AI 转型访谈', '业务场景梳理', '管理层与团队培训', '工具选型与流程设计', '试点陪跑'],
    outcome: '形成一套团队真的会用、业务真的用得上的 AI 工作方法。',
    cta: '预约场景共创'
  },
  {
    id: 'canvas-agent',
    direction: 'agent',
    title: '智能工作空间与 Agent 原型',
    subtitle: '把知识、任务与智能体放进同一张画布',
    audience: '适合需要沉淀知识、流程、任务协作的组织。',
    includes: ['无限画布原型', '知识结构设计', 'Agent 工作流设计', '业务看板与任务流', '内部 Demo / MVP'],
    outcome: '获得一个可演示、可迭代的智能协作原型。',
    cta: '预约场景共创'
  },
  {
    id: 'aigc-video',
    direction: 'aigc',
    title: 'AIGC 视频与品牌内容管线',
    subtitle: '从灵感生成到生产流程',
    audience: '适合品牌传播、课程内容、产品发布、企业宣传。',
    includes: ['创意概念', '脚本与分镜', 'AIGC 视频生成', '后期剪辑与包装', '可复用生产规范'],
    outcome: '建立可复用的视频内容生产流程，而不是一次性素材。',
    cta: '预约场景共创'
  },
  {
    id: 'personal-capability',
    direction: 'personal',
    title: '个人 AI 能力建设',
    subtitle: '建立学习、研究与表达能力',
    audience: '适合学生、创作者、申请者、个人品牌建设者。',
    includes: ['作品集网站', 'vibe coding', '研究项目表达', '申请材料与海外学习准备'],
    outcome: '把个人想法转化为能被看见、能被表达、能被验证的作品。',
    cta: '预约场景共创'
  }
]
