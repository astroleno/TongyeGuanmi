export const SITE_META = {
  language: 'zh-CN',
  title: '同野观幂｜AI 转型与能力建设',
  description: '同野观幂是一家面向组织与个人能力建设的 AI 转型咨询公司，帮助企业把 AI 变成团队真正会用、业务真正用得上的能力。',
  canonicalPath: '/',
  footer: {
    company: '© 上海同野观幂科技有限公司',
    tagline: 'AI Transformation & Capability Building',
    filingText: '服务备案号 沪ICP备2024086119号-3',
    filingUrl: 'https://beian.miit.gov.cn/',
    publicSecurityText: '沪公网安备 31011502406697号',
    publicSecurityUrl: 'https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=31011502406697',
    publicSecurityAriaLabel: '沪公网安备 31011502406697号（新窗口打开）'
  }
} as const;

export const SITE_FOOTER_TEXT = [
  SITE_META.footer.company,
  SITE_META.footer.tagline,
  SITE_META.footer.filingText,
  SITE_META.footer.publicSecurityText
] as const;
