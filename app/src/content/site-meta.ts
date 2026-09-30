export const SITE_META = {
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
