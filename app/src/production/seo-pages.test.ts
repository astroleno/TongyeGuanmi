// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FAQS, SERVICES } from '../../build/seo-content';
import { SITE_META } from '../content/site-meta';
import { canonicalUrl, PUBLIC_PAGES } from '../../build/seo-meta';
import { renderContentPage, renderLlms, renderRobots, renderSitemap } from '../../build/seo-pages';

describe('public service and FAQ content', () => {
  for (const page of [PUBLIC_PAGES.services, PUBLIC_PAGES.faq]) {
    it(`keeps ${page.path} independently readable and canonically identified`, () => {
      const document = new DOMParser().parseFromString(renderContentPage(page, '/content/test.css'), 'text/html');
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      expect(document.title).toBe(page.title);
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(canonicalUrl(page));
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(page.description);
      expect(document.querySelectorAll('script:not([type="application/ld+json"]),video,canvas,iframe')).toHaveLength(0);
      expect(document.querySelectorAll('[hidden],[inert],details')).toHaveLength(0);
      for (const link of document.querySelectorAll('a[href^="#"]')) {
        expect(document.getElementById(link.getAttribute('href')!.slice(1))).not.toBeNull();
      }
      expect(document.querySelector(`a[href="${SITE_META.contact.mailto}"]`)).not.toBeNull();
    });
  }

  it('publishes the same service facts and stable targets as its entity graph', () => {
    const document = new DOMParser().parseFromString(renderContentPage(PUBLIC_PAGES.services, '/content/test.css'), 'text/html');
    const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!)['@graph'];
    for (const service of SERVICES) {
      const article = document.getElementById(service.id)!;
      expect(article.textContent).toContain(service.name);
      expect(article.textContent).toContain(service.description);
      expect(article.textContent).toContain(service.body);
      const offer = graph[0].hasOfferCatalog.itemListElement.find((item: {itemOffered: {name: string}}) => item.itemOffered.name === service.name);
      expect(offer.itemOffered.url).toBe(`https://tongye.me/services/#${service.id}`);
    }
  });

  it('keeps every FAQ answer identical in visible HTML, structured data and llms', () => {
    const document = new DOMParser().parseFromString(renderContentPage(PUBLIC_PAGES.faq, '/content/test.css'), 'text/html');
    const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!)['@graph'];
    const faqPage = graph.find((item: {'@type': string}) => item['@type'] === 'FAQPage');
    expect(faqPage.mainEntity).toHaveLength(6);
    for (const faq of FAQS) {
      const article = document.getElementById(faq.id)!;
      expect(article.querySelector('h2')?.textContent).toBe(faq.question);
      expect(article.querySelector('p')?.textContent).toBe(faq.answer);
      expect(faqPage.mainEntity.find((item: {name: string}) => item.name === faq.question).acceptedAnswer.text).toBe(faq.answer);
      expect(renderLlms()).toContain(faq.answer);
    }
  });

  it('lists only public canonical pages and keeps exclusions for every wildcard crawler', () => {
    const document = new DOMParser().parseFromString(renderSitemap(), 'application/xml');
    expect([...document.querySelectorAll('loc')].map((item) => item.textContent))
      .toEqual(['https://tongye.me/', 'https://tongye.me/services/', 'https://tongye.me/faq/']);
    expect(renderRobots().match(/User-agent:/g)).toHaveLength(1);
    for (const route of ['/brand-lab', '/harness/', '/__preview/', '/audit/']) {
      expect(renderRobots()).toContain(`Disallow: ${route}`);
    }
  });

  it('publishes a directly usable contact channel for people and language models', () => {
    expect(renderLlms()).toContain(SITE_META.contact.email);
    expect(renderLlms()).toContain(SITE_META.contact.mailto);
    const document = new DOMParser().parseFromString(
      renderContentPage(PUBLIC_PAGES.services, '/content/test.css'),
      'text/html'
    );
    expect(document.querySelector(`a[href="${SITE_META.contact.mailto}"]`)?.textContent)
      .toContain('预约诊断');
  });

  it('escapes HTML text and JSON-LD script terminators', () => {
    const page = {...PUBLIC_PAGES.faq, title: '测试</script><img src=x onerror=alert(1)>'};
    const document = new DOMParser().parseFromString(renderContentPage(page, '/content/test.css'), 'text/html');
    expect(document.title).toBe(page.title);
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(JSON.parse(document.querySelector('script')!.textContent!)['@graph'][2].name).toBe(page.title);
  });
});
