import { describe, expect, it } from 'vitest';
import { renderSeoHead, structuredData } from '../../build/seo-head';
import { PUBLIC_PAGES, SEO_META } from '../../build/seo-meta';
import { SITE_META } from '../content/site-meta';

describe('SEO and GEO head metadata', () => {
  it('identifies the mounted experience without moving the organization or public services', () => {
    const page = { ...PUBLIC_PAGES.home, path: '/experience/' };
    const html = renderSeoHead(SEO_META, page);
    const graph = structuredData(SEO_META, page)['@graph'];
    expect(html).toContain('<link rel="canonical" href="https://tongye.me/experience/">');
    expect(html).toContain('property="og:url" content="https://tongye.me/experience/"');
    expect(graph[0].url).toBe('https://tongye.me/');
    expect(graph[1].url).toBe('https://tongye.me/');
    expect(graph[2].url).toBe('https://tongye.me/experience/');
    expect(graph[0].hasOfferCatalog.itemListElement.every(({ itemOffered }) =>
      itemOffered.url.startsWith('https://tongye.me/services/#'))).toBe(true);
  });

  it('renders canonical, crawler, social, and share-image metadata with absolute URLs', () => {
    const html = renderSeoHead();

    expect(html).toContain(`<link rel="canonical" href="${SEO_META.canonicalUrl}">`);
    expect(html).toContain('name="robots" content="index,follow,max-image-preview:large');
    expect(html).toContain(`property="og:title" content="${SEO_META.title}"`);
    expect(html).toContain(`property="og:image" content="${SEO_META.socialImage.url}"`);
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain(`name="twitter:description" content="${SEO_META.description}"`);
  });

  it('describes the organization, website, page, and real service catalogue', () => {
    const data = structuredData();
    const types = data['@graph'].map((entry) => entry['@type']);
    const organization = data['@graph'][0];

    expect(types).toEqual(['Organization', 'WebSite', 'WebPage']);
    expect(organization).toMatchObject({
      name: SEO_META.brandName,
      legalName: SEO_META.legalName,
      url: SEO_META.canonicalUrl,
      email: SITE_META.contact.email
    });
    expect(organization.hasOfferCatalog.itemListElement).toHaveLength(SEO_META.services.length);
    expect(organization.hasOfferCatalog.itemListElement.map(({ itemOffered }) => itemOffered.name))
      .toEqual(SEO_META.services.map(({ name }) => name));
  });
});
