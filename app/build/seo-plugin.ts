import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { PUBLIC_PAGES, SEO_META } from './seo-meta';
import { renderContentPage, renderLlms, renderNotFound, renderRobots, renderSitemap } from './seo-pages';

export function seoPagesPlugin(): Plugin {
  let development = false;
  const css = readFileSync(new URL('./content-pages.css', import.meta.url), 'utf8');
  const stylesheet = `/content/pages-${createHash('sha256').update(css).digest('hex').slice(0,12)}.css`;
  const webManifest = `${JSON.stringify({
    name: SEO_META.brandName,
    short_name: SEO_META.brandName,
    description: SEO_META.description,
    lang: SEO_META.language,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#040807',
    theme_color: '#040807',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  }, null, 2)}\n`;
  const faviconIco = readFileSync(new URL('../../assets/favicon.ico', import.meta.url));
  const appleTouchIcon = readFileSync(new URL('../../assets/apple-touch-icon.png', import.meta.url));
  const icon192 = readFileSync(new URL('../../assets/icon-192.png', import.meta.url));
  const icon512 = readFileSync(new URL('../../assets/icon-512.png', import.meta.url));
  const resources = new Map<string, { type: string; body: string | Buffer }>([
    ['/robots.txt', { type: 'text/plain', body: renderRobots() }],
    ['/sitemap.xml', { type: 'application/xml', body: renderSitemap() }],
    ['/llms.txt', { type: 'text/plain', body: renderLlms() }],
    ['/favicon.svg', { type: 'image/svg+xml', body: readFileSync(new URL('../../assets/favicon.svg', import.meta.url)) }],
    ['/favicon.ico', { type: 'image/x-icon', body: faviconIco }],
    ['/apple-touch-icon.png', { type: 'image/png', body: appleTouchIcon }],
    ['/icon-192.png', { type: 'image/png', body: icon192 }],
    ['/icon-512.png', { type: 'image/png', body: icon512 }],
    ['/manifest.webmanifest', { type: 'application/manifest+json', body: webManifest }],
    ['/manifest.json', { type: 'application/manifest+json', body: webManifest }],
    ['/site.webmanifest', { type: 'application/manifest+json', body: webManifest }],
    [SEO_META.socialImage.path, { type: 'image/webp', body: readFileSync(new URL('../../assets/og-image.webp', import.meta.url)) }],
    [stylesheet, { type: 'text/css', body: css }],
    ['/404.html', { type: 'text/html', body: renderNotFound() }],
    ...[PUBLIC_PAGES.services, PUBLIC_PAGES.faq].map((page): [string, {type: string; body: string}] => [
      `${page.path}index.html`, { type: 'text/html', body: renderContentPage(page, stylesheet) }
    ])
  ]);
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void, serveSource: boolean) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const page = [PUBLIC_PAGES.services, PUBLIC_PAGES.faq].find((item) => (
      [item.path, item.path.slice(0, -1), `${item.path}index.html`].includes(url.pathname)
    ));
    if (page && url.pathname !== page.path) {
      res.writeHead(301, { Location: `${page.path}${url.search}` });
      res.end();
      return;
    }
    const resource = resources.get(page ? `${page.path}index.html` : url.pathname);
    if (resource && serveSource) {
      res.writeHead(url.pathname === '/404.html' ? 404 : 200, {
        'Content-Type': `${resource.type}${typeof resource.body === 'string' ? '; charset=utf-8' : ''}`,
        'Cache-Control': 'no-cache'
      });
      res.end(req.method === 'HEAD' ? undefined : resource.body);
      return;
    }
    if (page) req.url = `${page.path}index.html${url.search}`;
    // The production server explicitly permits this existing app route as well.
    if (url.pathname === '/brand-lab' || (
      (development || process.env.VITE_ENABLE_HARNESS === '1') && url.pathname.startsWith('/harness/')
    )) req.url = `/index.html${url.search}`;
    next();
  };
  return {
    name: 'seo-content-pages',
    configureServer(server) {
      development = true;
      server.middlewares.use((req, res, next) => middleware(req, res, next, true));
      return () => { server.middlewares.use((req, res, next) => {
        // Vite resolves / to /index.html before this hook, then renders HTML
        // after it. Let that canonical document reach Vite's HTML middleware.
        if (new URL(req.url ?? '/', 'http://localhost').pathname === '/index.html') return next();
        res.writeHead(404, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(renderNotFound());
      }); };
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => middleware(req, res, next, false));
      return () => { server.middlewares.use((req, res, next) => {
        if (new URL(req.url ?? '/', 'http://localhost').pathname === '/index.html') return next();
        const html = readFileSync(new URL('../../dist/404.html', import.meta.url), 'utf8');
        res.writeHead(404, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(html);
      }); };
    },
    generateBundle() {
      for (const [url, resource] of resources) {
        this.emitFile({ type: 'asset', fileName: url.slice(1), source: resource.body });
      }
    }
  };
}
