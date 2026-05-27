import type { ModalContent } from '@/types/scene'

export type ProjectItem = {
  id: string
  title: string
  summary: string
  problem: string
  method: string
  outcome: string
  image?: string
  tags: string[]
  signal: string
  modal: ModalContent
}

export const projects: ProjectItem[] = [
  {
    id: 'canvas-agent-workspace',
    title: '企业级无限画布平台 + Agent',
    summary: '把知识结构、业务流程、任务协作与智能体编排放进一张可协作画布。',
    problem: '知识、任务和智能体散落在不同工具里。',
    method: '梳理工作流入口，搭建画布原型，再接入权限和结果回写。',
    outcome: '一套可演示、可迭代的组织智能工作空间。',
    tags: ['Canvas', 'Agent', 'Workspace'],
    signal: '组织记忆 / 权限 / 结果回写',
    modal: {
      id: 'canvas-agent-summary',
      title: '智能工作空间方案摘要',
      summary: '从一个可演示 MVP 开始，把组织知识、任务流和 Agent 编排接入真实业务。',
      points: ['项目隔离与权限边界', '固定工作流入口', '知识结构与任务节点', 'Agent 执行结果回写']
    }
  },
  {
    id: 'aigc-video-pipeline',
    title: '生产级 AIGC 视频管线',
    summary: '把 Brief、脚本、分镜、提示词、生成、剪辑和交付沉淀为可复用流程。',
    problem: '内容生产依赖单次灵感，难以稳定交付。',
    method: '把 Brief、脚本、分镜、生成和后期拆成可复用节点。',
    outcome: '一条能持续生产品牌影像的 AIGC 管线。',
    tags: ['AIGC', 'Video', 'Pipeline'],
    signal: '7 步生产流程 / 5 个前端节点',
    modal: {
      id: 'aigc-video-cases',
      title: 'AIGC 视频管线案例摘要',
      summary: '以品牌概念和脚本策略为起点，建立能反复交付的生成式影像生产线。',
      points: ['脚本策略与分镜设计', '图像与视频生成', '后期整合与包装', '生产规范复用']
    }
  },
  {
    id: 'ai-transformation',
    title: '企业 AI 转型与培训陪跑',
    summary: '帮助管理层和业务团队把 AI 从概念引入流程、会议、内容和交付现场。',
    problem: '团队有工具热情，但缺少真实业务流程里的用法。',
    method: '访谈现场、共创场景、建立工具，再用培训和复盘陪跑。',
    outcome: '一套团队真的会用、业务真的用得上的 AI 工作方法。',
    tags: ['Consulting', 'Training', 'Workflow'],
    signal: '共识 / 场景 / 工具 / 陪跑',
    modal: {
      id: 'transformation-summary',
      title: '企业转型陪跑摘要',
      summary: '先看见真实流程，再共创 AI 能进入的第一个业务场景。',
      points: ['AI 转型访谈', '业务场景共创', '工具实施建议', '团队训练与复盘']
    }
  },
  {
    id: 'portfolio-vibe-coding',
    title: '个人作品集网站与 vibe coding',
    summary: '让非工程背景的人也能用 AI 做出真实作品，建立表达、研究和创造能力。',
    problem: '想法和经历很多，但缺少能被看见的作品载体。',
    method: '梳理表达结构，用 AI 辅助原型、编码、上线和复盘。',
    outcome: '一个真实可访问、可持续更新的个人作品项目。',
    tags: ['Portfolio', 'Vibe coding', 'Learning'],
    signal: '想法梳理 / 原型制作 / 发布上线',
    modal: {
      id: 'personal-summary',
      title: '个人能力建设摘要',
      summary: '用作品而不是课程证明能力，把想法变成可展示、可迭代的项目。',
      points: ['作品集结构', 'AI 辅助编码', '研究表达', '上线与复盘']
    }
  },
  {
    id: 'brand-content',
    title: '宣传视频与品牌内容制作',
    summary: '把品牌主张、方法论和案例表达转成可传播的视频、图文和发布素材。',
    problem: '品牌方法很清楚，但对外表达缺少连续内容形态。',
    method: '从叙事策略进入脚本、视觉提示词、生成和分发素材。',
    outcome: '一组能支撑发布节奏的品牌内容资产。',
    tags: ['Brand', 'Content', 'Launch'],
    signal: '概念 / 脚本 / 生成 / 分发',
    modal: {
      id: 'brand-content-summary',
      title: '品牌内容项目摘要',
      summary: '从品牌叙事到可发布素材，建立持续生产的内容工作流。',
      points: ['叙事策略', '视觉 prompt', '视频生成与剪辑', '发布素材体系']
    }
  }
]

export const modalContentMap: Record<string, ModalContent> = projects.reduce(
  (acc, project) => {
    acc[project.modal.id] = project.modal
    return acc
  },
  {} as Record<string, ModalContent>
)
