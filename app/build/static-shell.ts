import { SITE_META } from '../src/content/site-meta';
import staticCopyOmissions from './static-copy-omissions.json';

export type StaticCopySection = {
  sectionId: string;
  normalizedText: readonly string[];
  legacyOnly?: boolean;
};

export type StaticCopyReference = {
  sections: readonly StaticCopySection[];
  footerText: readonly string[];
};

export const STATIC_COPY_OMISSIONS = new Set(staticCopyOmissions);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderSection(section: StaticCopySection, headingTag: 'h1' | 'h2'): string {
  const [heading = section.sectionId, ...paragraphs] = section.normalizedText;
  return [
    `<section id="${escapeHtml(section.sectionId)}" data-static-section="${escapeHtml(section.sectionId)}">`,
    `<${headingTag}>${escapeHtml(heading)}</${headingTag}>`,
    ...paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`),
    '</section>'
  ].join('\n');
}

export function renderStaticStoryShell(copy: StaticCopyReference): string {
  const sections = copy.sections
    .filter((section) => !section.legacyOnly)
    .map((section) => ({
      ...section,
      normalizedText: section.normalizedText.filter((text) => !STATIC_COPY_OMISSIONS.has(text))
    }));
  return [
    '<div class="static-content" data-static-story-content="true">',
    '<header class="static-content__header">',
    '<a href="#home" aria-label="同野观幂首页">同野观幂</a>',
    '<nav aria-label="章节导航">',
    '<a href="#method">方法</a>',
    '<a href="#services">场景</a>',
    '<a href="#education">留学</a>',
    '<a href="#contact">联系</a>',
    '</nav>',
    '</header>',
    '<main class="static-content__main">',
    ...sections.map((section, index) => renderSection(section, index === 0 ? 'h1' : 'h2')),
    '</main>',
    '<footer class="site-footer" data-site-footer="true">',
    '<div class="site-footer__meta">',
    `<span>${escapeHtml(SITE_META.footer.company)}</span>`,
    `<span>${escapeHtml(SITE_META.footer.tagline)}</span>`,
    '</div>',
    '<div class="site-footer__records">',
    `<a class="site-footer__record" href="${escapeHtml(SITE_META.footer.filingUrl)}">${escapeHtml(SITE_META.footer.filingText)}</a>`,
    `<a class="site-footer__record" href="${escapeHtml(SITE_META.footer.publicSecurityUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(SITE_META.footer.publicSecurityAriaLabel)}">${escapeHtml(SITE_META.footer.publicSecurityText)}</a>`,
    '</div>',
    '</footer>',
    '<noscript><p>当前为无 JavaScript 正文模式；全部核心内容与章节锚点仍可阅读。</p></noscript>',
    '</div>'
  ].join('\n');
}
