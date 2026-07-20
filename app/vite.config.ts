import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderStaticStoryShell, type StaticCopyReference } from './build/static-shell';
import { SITE_META } from './src/content/site-meta';

const copyReference = JSON.parse(
  readFileSync(new URL('../docs/react-refactor/inventory/copy-reference.json', import.meta.url), 'utf8')
) as StaticCopyReference;

type CdnReleasePolicy = Readonly<{
  schemaVersion: number;
  assetExtensions: readonly string[];
  mediaExtensions: readonly string[];
}>;

const cdnReleasePolicy = JSON.parse(
  readFileSync(new URL('./build/cdn-release-policy.json', import.meta.url), 'utf8')
) as CdnReleasePolicy;
const releaseId = process.env.R5_RELEASE_ID?.trim() ?? '';
const requireCdn = process.env.R5_REQUIRE_CDN === '1';
const assetCdnBase = (process.env.R5_ASSET_CDN_BASE?.trim() || 'https://assets.tongye.me')
  .replace(/\/+$/, '');
const mediaCdnBase = (process.env.R5_MEDIA_CDN_BASE?.trim() || 'https://media.tongye.me')
  .replace(/\/+$/, '');
const assetExtensions = new Set(cdnReleasePolicy.assetExtensions);
const mediaExtensions = new Set(cdnReleasePolicy.mediaExtensions);

if (cdnReleasePolicy.schemaVersion !== 1) {
  throw new Error(`unsupported CDN release policy schema: ${cdnReleasePolicy.schemaVersion}`);
}
if (requireCdn && !releaseId) {
  throw new Error('R5_REQUIRE_CDN=1 requires R5_RELEASE_ID');
}
if (releaseId && !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(releaseId)) {
  throw new Error(`invalid R5_RELEASE_ID: ${releaseId}`);
}
for (const [label, value] of [
  ['R5_ASSET_CDN_BASE', assetCdnBase],
  ['R5_MEDIA_CDN_BASE', mediaCdnBase]
] as const) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS origin without a path, query, or fragment`);
  }
}

function cdnUrlFor(filename: string): string | undefined {
  if (!releaseId) {
    return undefined;
  }
  const extension = path.extname(filename).toLowerCase();
  if (mediaExtensions.has(extension)) {
    return `${mediaCdnBase}/releases/${releaseId}/${filename}`;
  }
  if (assetExtensions.has(extension)) {
    return `${assetCdnBase}/releases/${releaseId}/${filename}`;
  }
  return undefined;
}

function cdnRuntimeFor(filename: string): string | undefined {
  const extension = path.extname(filename).toLowerCase();
  const relativeFilename = filename.startsWith('assets/')
    ? filename.slice('assets/'.length)
    : filename;
  if (mediaExtensions.has(extension)) {
    return `$m+${JSON.stringify(relativeFilename)}`;
  }
  if (assetExtensions.has(extension)) {
    return `$a+${JSON.stringify(relativeFilename)}`;
  }
  return undefined;
}

function staticStoryShellPlugin() {
  const escapeAttribute = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return {
    name: 'static-story-shell',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string) {
        const cdnRuntime = releaseId
          ? `<script>var $a=${JSON.stringify(`${assetCdnBase}/releases/${releaseId}/assets/`)},$m=${JSON.stringify(`${mediaCdnBase}/releases/${releaseId}/assets/`)}</script>`
          : '';
        return html
          .replace('__SITE_LANGUAGE__', escapeAttribute(SITE_META.language))
          .replace('__SITE_DESCRIPTION__', escapeAttribute(SITE_META.description))
          .replace('__SITE_TITLE__', escapeAttribute(SITE_META.title))
          .replace('<!--__CANONICAL_LINK__-->', `<link rel="canonical" href="${SITE_META.canonicalPath}">`)
          .replace('<!--__R5_CDN_RUNTIME__-->', cdnRuntime)
          .replace('<!--__STATIC_STORY_CONTENT__-->', renderStaticStoryShell(copyReference));
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), staticStoryShellPlugin()],
  ...(releaseId
    ? {
        experimental: {
          renderBuiltUrl(
            filename: string,
            { type, hostType }: { type: 'asset' | 'public'; hostType: 'html' | 'css' | 'js' }
          ) {
            if (type !== 'asset') {
              return undefined;
            }
            if (hostType === 'js') {
              const runtime = cdnRuntimeFor(filename);
              return runtime ? { runtime } : undefined;
            }
            return cdnUrlFor(filename);
          }
        }
      }
    : {}),
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'eslint-rules/**/*.test.mjs',
      'scripts/**/*.test.mjs'
    ]
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    manifest: true,
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2 }
    },
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    modulePreload: false,
    chunkSizeWarningLimit: 420,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash:6][extname]',
        chunkFileNames: 'assets/[name]-[hash:7].js',
        entryFileNames: 'assets/[name]-[hash:7].js',
        manualChunks(id) {
          if (id.includes('/src/transitions/shared/stagedMediaHandoff.ts')) {
            return 'staged-media-runtime';
          }
          if ([
            '/src/transitions/shared/ink.ts',
            '/src/transitions/shared/inkOwnership.ts',
            '/src/transitions/shared/sceneInk.ts',
            '/src/media/timeline-video-driver.ts',
            '/src/pilot/progress-timeline.ts',
            '/src/transitions/shared/sectionHandoff.ts'
          ].some((moduleId) => id.includes(moduleId))) {
            return 'story-runtime';
          }
          return undefined;
        }
      }
    }
  }
});
