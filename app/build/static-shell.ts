export type StaticCopySection = {
  sectionId: string;
  normalizedText: readonly string[];
  legacyOnly?: boolean;
};

export type StaticCopyReference = {
  sections: readonly StaticCopySection[];
  footerText: readonly string[];
};

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
  const sections = copy.sections.filter((section) => !section.legacyOnly);
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
    '<footer>',
    ...copy.footerText.map((text) => `<p>${escapeHtml(text)}</p>`),
    '</footer>',
    '<noscript><p>当前为无 JavaScript 正文模式；全部核心内容与章节锚点仍可阅读。</p></noscript>',
    '</div>'
  ].join('\n');
}
