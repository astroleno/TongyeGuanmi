export const SEO_META = {
  origin: 'https://tongye.me',
  language: 'zh-CN',
  locale: 'zh_CN',
  brandName: '同野观幂',
  legalName: '上海同野观幂科技有限公司',
  title: '同野观幂｜企业 AI 转型咨询、培训与场景落地',
  homeHeading: '同野观幂｜企业 AI 转型咨询与场景落地',
  description: '同野观幂为企业提供 AI 转型咨询、管理层共识、岗位培训、场景共创、知识库与智能体落地陪跑，从业务现场识别降本增效机会，用可验证指标把 AI 变成团队日常能力。',
  canonicalPath: '/',
  canonicalUrl: 'https://tongye.me/',
  socialImage: {
    path: '/og-image.webp',
    url: 'https://tongye.me/og-image.webp',
    width: 1200,
    height: 630,
    alt: '同野观幂企业 AI 转型咨询与场景落地'
  },
  services: [
    {
      id: 'ai-consulting',
      name: 'AI 转型咨询',
      description: '理清企业哪些环节适合使用 AI、预期收益与实施顺序，形成可执行的转型路线图。'
    },
    {
      id: 'team-training',
      name: '企业培训',
      description: '面向管理层、中层与一线岗位提供按实际工作场景定制的 AI 能力培训。'
    },
    {
      id: 'scenario-co-creation',
      name: '场景共创',
      description: '把业务现场的模糊需求拆解成可实施、可复用、可验证的 AI 应用。'
    },
    {
      id: 'implementation-support',
      name: '工具实施与陪跑',
      description: '搭建模板、知识库、专属 AI 助手与自动流程，并通过持续复盘推动日常使用。'
    }
  ]
} as const;

export type SeoPage = Readonly<{
  path: string;
  title: string;
  heading: string;
  description: string;
}>;

export const PUBLIC_PAGES = {
  home: {
    path: '/', title: SEO_META.title, heading: SEO_META.homeHeading,
    description: SEO_META.description
  },
  services: {
    path: '/services/',
    title: '企业 AI 转型服务与实施方法｜同野观幂',
    heading: '从业务现场，\n到团队日常。',
    description: '了解同野观幂的 AI 转型咨询、企业培训、场景共创、工具实施与陪跑，以及从识场到陪跑的五步方法。先跑通一个业务环节，再决定如何扩大。'
  },
  faq: {
    path: '/faq/',
    title: '企业 AI 转型常见问题｜同野观幂',
    heading: '先把问题\n聊清楚。',
    description: '企业 AI 转型从哪里开始？是否只是培训？数据如何把关？交付后是否陪跑？同野观幂根据现有服务与工作方法，回答六个合作前的常见问题。'
  }
} as const satisfies Record<string, SeoPage>;

export function canonicalUrl(page: SeoPage): string {
  return new URL(page.path, SEO_META.origin).href;
}
