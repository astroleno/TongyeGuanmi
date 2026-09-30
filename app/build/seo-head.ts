import { SITE_META } from '../src/content/site-meta';
import { FAQS } from './seo-content';
import { canonicalUrl, PUBLIC_PAGES, SEO_META, type SeoPage } from './seo-meta';

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function structuredData(meta: typeof SEO_META = SEO_META, page: SeoPage = PUBLIC_PAGES.home) {
  const organizationId = `${meta.canonicalUrl}#organization`;
  const websiteId = `${meta.canonicalUrl}#website`;
  const url = canonicalUrl(page);
  const webpageId = `${url}#webpage`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: meta.brandName,
        legalName: meta.legalName,
        url: meta.canonicalUrl,
        description: meta.description,
        slogan: SITE_META.footer.tagline,
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          '@id': `${meta.origin}/services/#catalog`,
          name: '企业 AI 转型服务',
          itemListElement: meta.services.map((service) => ({
            '@type': 'Offer',
            itemOffered: {
              '@type': 'Service',
              '@id': `${meta.origin}/services/#${service.id}`,
              url: `${meta.origin}/services/#${service.id}`,
              name: service.name,
              description: service.description,
              provider: { '@id': organizationId }
            }
          }))
        }
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: meta.canonicalUrl,
        name: meta.brandName,
        description: meta.description,
        inLanguage: meta.language,
        publisher: { '@id': organizationId }
      },
      {
        '@type': page.path === PUBLIC_PAGES.faq.path ? 'FAQPage' : 'WebPage',
        '@id': webpageId,
        url,
        name: page.title,
        description: page.description,
        inLanguage: meta.language,
        isPartOf: { '@id': websiteId },
        about: { '@id': organizationId },
        ...(page.path === PUBLIC_PAGES.services.path
          ? { mainEntity: { '@id': `${meta.origin}/services/#catalog` } }
          : {}),
        ...(page.path === PUBLIC_PAGES.faq.path
          ? { mainEntity: FAQS.map((faq) => ({
            '@type': 'Question', '@id': `${url}#${faq.id}`, name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer }
          })) }
          : {})
      }
    ]
  } as const;
}

export function renderSeoHead(meta: typeof SEO_META = SEO_META, page: SeoPage = PUBLIC_PAGES.home): string {
  const attribute = (value: string | number) => escapeAttribute(String(value));
  const jsonLd = JSON.stringify(structuredData(meta, page)).replaceAll('<', '\\u003c');

  return [
    `<link rel="canonical" href="${attribute(canonicalUrl(page))}">`,
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    '<meta name="googlebot" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">',
    `<meta name="author" content="${attribute(meta.legalName)}">`,
    `<meta name="application-name" content="${attribute(meta.brandName)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:locale" content="${attribute(meta.locale)}">`,
    `<meta property="og:site_name" content="${attribute(meta.brandName)}">`,
    `<meta property="og:title" content="${attribute(page.title)}">`,
    `<meta property="og:description" content="${attribute(page.description)}">`,
    `<meta property="og:url" content="${attribute(canonicalUrl(page))}">`,
    `<meta property="og:image" content="${attribute(meta.socialImage.url)}">`,
    `<meta property="og:image:secure_url" content="${attribute(meta.socialImage.url)}">`,
    '<meta property="og:image:type" content="image/webp">',
    `<meta property="og:image:width" content="${attribute(meta.socialImage.width)}">`,
    `<meta property="og:image:height" content="${attribute(meta.socialImage.height)}">`,
    `<meta property="og:image:alt" content="${attribute(meta.socialImage.alt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attribute(page.title)}">`,
    `<meta name="twitter:description" content="${attribute(page.description)}">`,
    `<meta name="twitter:image" content="${attribute(meta.socialImage.url)}">`,
    `<meta name="twitter:image:alt" content="${attribute(meta.socialImage.alt)}">`,
    `<script type="application/ld+json">${jsonLd}</script>`
  ].join('\n');
}
