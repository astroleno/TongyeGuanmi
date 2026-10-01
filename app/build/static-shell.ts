import { SITE_META } from '../src/content/site-meta';
import { SEO_META } from './seo-meta';
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

type SectionRenderOptions = Readonly<{
  heading?: string;
  paragraphs?: readonly string[];
  primary?: boolean;
  action?: string;
}>;

function renderSection(
  section: StaticCopySection,
  headingTag: 'h1' | 'h2',
  options: SectionRenderOptions = {}
): string {
  const [defaultHeading = section.sectionId, ...defaultParagraphs] = section.normalizedText;
  const heading = options.heading ?? defaultHeading;
  const paragraphs = options.paragraphs ?? defaultParagraphs;
  const headingId = `static-${section.sectionId}-title`;
  const primaryAttribute = options.primary ? ' data-static-primary-heading="true"' : '';
  return [
    `<section id="${escapeHtml(section.sectionId)}" data-static-section="${escapeHtml(section.sectionId)}" aria-labelledby="${escapeHtml(headingId)}">`,
    `<${headingTag} id="${escapeHtml(headingId)}"${primaryAttribute}>${escapeHtml(heading)}</${headingTag}>`,
    ...paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`),
    options.action ?? '',
    '</section>'
  ].join('\n');
}

function renderStorySection(section: StaticCopySection, index: number): string {
  if (index !== 0) {
    if (section.sectionId === 'contact') {
      return renderSection(section, 'h2', {
        action: `<p><a href="${escapeHtml(SITE_META.contact.mailto)}">${escapeHtml(SITE_META.contact.email)}</a></p>`
      });
    }
    return renderSection(section, 'h2');
  }

  const splitBrand = section.sectionId === 'home'
    && section.normalizedText.slice(0, 4).join('') === SEO_META.brandName;
  const paragraphs = splitBrand
    ? section.normalizedText.slice(4)
    : section.normalizedText.slice(1);

  return renderSection(section, 'h1', {
    heading: SEO_META.homeHeading,
    paragraphs,
    primary: true
  });
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
    '<main class="static-content__main" tabindex="-1">',
    ...sections.map(renderStorySection),
    '</main>',
    '<footer class="site-footer" data-site-footer="true">',
    '<div class="site-footer__meta">',
    `<span>${escapeHtml(SITE_META.footer.company)}</span>`,
    `<span>${escapeHtml(SITE_META.footer.tagline)}</span>`,
    '</div>',
    '<div class="site-footer__records">',
    '<a class="site-footer__record" href="/services/">服务说明</a>',
    '<a class="site-footer__record" href="/faq/">常见问题</a>',
    `<a class="site-footer__record" href="${escapeHtml(SITE_META.footer.filingUrl)}">${escapeHtml(SITE_META.footer.filingText)}</a>`,
    `<a class="site-footer__record" href="${escapeHtml(SITE_META.footer.publicSecurityUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(SITE_META.footer.publicSecurityAriaLabel)}">${escapeHtml(SITE_META.footer.publicSecurityText)}</a>`,
    '</div>',
    '</footer>',
    '<noscript><p>当前为无 JavaScript 正文模式；全部核心内容与章节锚点仍可阅读。</p></noscript>',
    '</div>'
  ].join('\n');
}
