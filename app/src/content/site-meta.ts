export const SITE_META = {
  contact: {
    email: 'aitoshuu@gmail.com',
    mailto: 'mailto:aitoshuu@gmail.com?subject=%E5%90%8C%E9%87%8E%E8%A7%82%E5%B9%82%20AI%20%E8%AF%8A%E6%96%AD%E5%92%A8%E8%AF%A2'
  },
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
