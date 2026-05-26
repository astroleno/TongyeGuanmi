import type { LeadDirection } from '@/types/lead'

export type FieldNode = {
  id: string
  icon: 'org' | 'infinity' | 'video' | 'person'
  title: string
  subtitle: string
  direction: LeadDirection
  target: string
}

export const fieldNodes: FieldNode[] = [
  {
    id: 'organization',
    icon: 'org',
    title: '组织 AI 转型',
    subtitle: '咨询 / 培训 / 场景共创 / 落地陪跑',
    direction: 'enterprise',
    target: 'organization'
  },
  {
    id: 'canvas-agent',
    icon: 'infinity',
    title: '企业级无限画布 + Agent',
    subtitle: '工作流、协作与知识组织',
    direction: 'agent',
    target: 'canvas-agent'
  },
  {
    id: 'video-pipeline',
    icon: 'video',
    title: '生产级 AIGC 视频管线',
    subtitle: '脚本、分镜、生成与交付',
    direction: 'aigc',
    target: 'video-pipeline'
  },
  {
    id: 'personal',
    icon: 'person',
    title: '个人 AI 能力建设',
    subtitle: '作品、表达与学习训练',
    direction: 'personal',
    target: 'personal'
  }
]
