import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const origin = 'https://tongye.me';
const pages = new Map();
const paths = ['/', '/services/', '/faq/'];
for (const route of paths) {
  const html = await readFile(path.join(dist, route, 'index.html'), 'utf8');
  const document = new JSDOM(html, {url: `${origin}${route}`}).window.document;
  pages.set(route, document);
  assert.equal(document.querySelectorAll('h1').length, 1, `${route}: expected one initial H1`);
  assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
  assert.equal(document.querySelector('link[rel="canonical"]').href, `${origin}${route}`);
  assert(document.title.includes('同野观幂'), `${route}: missing brand title`);
  assert(document.querySelector('meta[name="description"]')?.content.length > 30);
  assert(!/noindex|none/.test(document.querySelector('meta[name="robots"]')?.content ?? ''));
  assert.equal(document.querySelector('meta[property="og:url"]').content, `${origin}${route}`);
  assert.equal(document.querySelector('meta[property="og:title"]').content, document.title);
  assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length, 1);
  const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
  assert.equal(graph.find((entry) => entry['@type'] === 'Organization').legalName, '上海同野观幂科技有限公司');
  assert(graph.some((entry) => entry.url === `${origin}${route}`));
  if (route !== '/') {
    assert.equal(document.querySelectorAll('script:not([type="application/ld+json"]), video, canvas, iframe').length, 0);
    const stylesheet = document.querySelector('link[rel="stylesheet"]').getAttribute('href');
    assert.match(stylesheet, /^\/content\/pages-[a-f0-9]{12}\.css$/);
    assert((await readFile(path.join(dist, stylesheet))).length < 12_000, 'content CSS exceeds its standalone budget');
    assert(document.querySelector('a[href="/#contact"]'));
  }
  if (route === '/faq/') {
    const faq = graph.find((entry) => entry['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, 6);
    for (const question of faq.mainEntity) {
      const article = document.getElementById(new URL(question['@id']).hash.slice(1));
      assert.equal(article?.querySelector('h2')?.textContent, question.name);
      assert.equal(article?.querySelector('p')?.textContent, question.acceptedAnswer.text);
    }
  }
}
assert.equal(new Set([...pages.values()].map((document) => document.title)).size, paths.length, 'public page titles must be distinct');
for (const [route, document] of pages) {
  for (const anchor of document.querySelectorAll('a[href]')) {
    const url = new URL(anchor.href);
    if (url.origin !== origin) continue;
    assert(pages.has(url.pathname), `${route}: unrecognized public link ${url}`);
    if (url.hash) assert(pages.get(url.pathname).getElementById(decodeURIComponent(url.hash.slice(1))), `${route}: broken anchor ${url}`);
  }
}
const sitemap = new JSDOM(await readFile(path.join(dist, 'sitemap.xml'), 'utf8'), {contentType: 'application/xml'}).window.document;
assert.deepEqual([...sitemap.querySelectorAll('loc')].map((entry) => entry.textContent), paths.map((route) => `${origin}${route}`));
const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8');
for (const [, address] of llms.matchAll(/\]\((https:\/\/[^)]+)\)/g)) {
  const url = new URL(address);
  assert.equal(url.origin, origin);
  assert(pages.has(url.pathname), `llms: unknown page ${url}`);
  if (url.hash) assert(pages.get(url.pathname).getElementById(url.hash.slice(1)), `llms: broken anchor ${url}`);
}
const notFound = new JSDOM(await readFile(path.join(dist, '404.html'), 'utf8')).window.document;
assert.equal(notFound.querySelector('meta[name="robots"]').content, 'noindex');
process.stdout.write(`${JSON.stringify({seo: 'passed', pages: paths, faqAnswers: 6, staticContentOnly: true})}\n`);
