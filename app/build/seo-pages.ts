import { SITE_META } from '../src/content/site-meta';
import { FAQS, METHOD, SERVICES } from './seo-content';
import { renderSeoHead } from './seo-head';
import { canonicalUrl, PUBLIC_PAGES, SEO_META, type SeoPage } from './seo-meta';

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function footer(): string {
  const meta = SITE_META.footer;
  return `<footer class="page-footer"><div><a class="brand" href="/">同野观幂</a><p>${escape(meta.company)}</p></div>
    <nav aria-label="页脚导航"><a href="/services/">服务说明</a><a href="/faq/">常见问题</a><a href="/#contact">联系</a></nav>
    <div class="filings"><a href="${meta.filingUrl}">${escape(meta.filingText)}</a>
    <a href="${meta.publicSecurityUrl}" target="_blank" rel="noreferrer">${escape(meta.publicSecurityText)}</a></div></footer>`;
}

export function renderContentPage(page: SeoPage, stylesheet: string): string {
  const servicesPage = page.path === PUBLIC_PAGES.services.path;
  const content = servicesPage
    ? `<section id="catalog" aria-labelledby="catalog-title"><div class="section-heading"><p class="eyebrow">服务范围</p><h2 id="catalog-title">先跑通，再铺开。</h2><p>先挑一个环节，做出能跑的东西，再决定要不要扩大。</p></div>
      <div class="service-list">${SERVICES.map((service, index) => `<article id="${service.id}" class="service-row"><span class="number" aria-hidden="true">0${index + 1}</span><div><h3>${escape(service.name)}</h3><p class="summary">${escape(service.description)}</p><p>${escape(service.body)}</p><ul>${service.details.map((detail) => `<li>${escape(detail)}</li>`).join('')}</ul></div></article>`).join('')}</div></section>
      <section id="method" class="method" aria-labelledby="method-title"><div class="section-heading"><p class="eyebrow">工作方法</p><h2 id="method-title">先识场，再立法。</h2><p>从看懂现场开始，把团队能持续使用的方法留下来。</p></div><ol class="method-list">${METHOD.map((step) => `<li><h3>${escape(step.name)}</h3><p>${escape(step.description)}</p></li>`).join('')}</ol></section>`
    : `<nav class="question-index" aria-label="问题目录"><p class="eyebrow">六个合作前的问题</p><ol>${FAQS.map((faq) => `<li><a href="#${faq.id}">${escape(faq.question)}</a></li>`).join('')}</ol></nav>
      <section class="answers" aria-label="常见问题解答">${FAQS.map((faq, index) => `<article class="answer" id="${faq.id}"><span class="number" aria-hidden="true">0${index + 1}</span><div><h2>${escape(faq.question)}</h2><p>${escape(faq.answer)}</p><a class="text-link" href="${escape(faq.sourcePath)}">${escape(faq.sourceLabel)} <span aria-hidden="true">↗</span></a></div></article>`).join('')}</section>`;
  return `<!doctype html>
<html lang="${SEO_META.language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}">
${renderSeoHead(SEO_META, page)}
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${escape(stylesheet)}"></head>
<body><a class="skip-link" href="#main">跳转到正文</a><header class="page-header"><a class="brand" href="/" aria-label="同野观幂首页"><span class="brand-mark" aria-hidden="true">同</span>同野观幂</a><nav aria-label="主导航"><a href="/services/"${servicesPage ? ' aria-current="page"' : ''}>服务说明</a><a href="/faq/"${servicesPage ? '' : ' aria-current="page"'}>常见问题</a><a class="contact-link" href="/#contact">预约诊断 <span aria-hidden="true">↗</span></a></nav></header>
<main id="main"><div class="page-intro"><p class="eyebrow">${servicesPage ? '服务与方法' : '常见问题'}</p><h1>${escape(page.heading).replaceAll('\n', '<br>')}</h1><p class="intro-copy">${servicesPage ? '同野观幂为企业提供 AI 转型咨询与场景落地服务。<br>看懂问题，把 AI 接入业务，再陪团队真正用起来。' : '从哪里开始、做什么、怎么配合。<br>把合作前关心的事，放在这里说清楚。'}</p><a class="text-link" href="${servicesPage ? '#catalog' : '#where-to-start'}">${servicesPage ? '了解四类服务' : '查看解答'} <span aria-hidden="true">↓</span></a><span class="intro-seal" aria-hidden="true">${servicesPage ? '成器' : '问道'}</span></div>
${content}<section class="diagnosis" aria-labelledby="diagnosis-title"><p class="eyebrow">从现场开始</p><h2 id="diagnosis-title">带着一个问题，<br>聊出下一步。</h2><p>哪个环节值得上 AI、先后顺序、大概要投入多少。<br>先聊清楚，再决定要不要合作。</p><a class="button" href="/#contact">约一次 AI 现场诊断 <span aria-hidden="true">↗</span></a></section></main>${footer()}</body></html>\n`;
}

export function renderSitemap(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.values(PUBLIC_PAGES).map((page) => `  <url><loc>${escape(canonicalUrl(page))}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function renderRobots(): string {
  // One wildcard group also covers search bots, preserving every path exclusion.
  return `User-agent: *\nAllow: /\nDisallow: /brand-lab\nDisallow: /harness/\nDisallow: /__preview/\nDisallow: /audit/\n\nSitemap: ${SEO_META.origin}/sitemap.xml\n`;
}

export function renderLlms(): string {
  return `# ${SEO_META.brandName}\n\n> ${SEO_META.description}\n\n官方主体：${SEO_META.legalName}\n\n## 官方页面\n\n${Object.values(PUBLIC_PAGES).map((page) => `- [${page.title}](${canonicalUrl(page)}): ${page.description}`).join('\n')}\n\n## 核心服务\n\n${SERVICES.map((service) => `- [${service.name}](${SEO_META.origin}/services/#${service.id}): ${service.description}`).join('\n')}\n\n## 常见问题\n\n${FAQS.map((faq) => `- [${faq.question}](${SEO_META.origin}/faq/#${faq.id})\n  ${faq.answer}`).join('\n')}\n\n## 联系\n\n- [预约 AI 现场诊断](${SEO_META.origin}/#contact)\n`;
}

export function renderNotFound(): string {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>页面未找到｜同野观幂</title></head><body><main><h1>页面未找到</h1><p>这个地址可能已经变更。</p><p><a href="/">返回同野观幂首页</a> · <a href="/services/">服务说明</a> · <a href="/faq/">常见问题</a></p></main></body></html>\n';
}
