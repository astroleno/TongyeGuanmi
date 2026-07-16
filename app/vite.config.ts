import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { renderStaticStoryShell, type StaticCopyReference } from './build/static-shell';
import { SITE_META } from './src/content/site-meta';

const copyReference = JSON.parse(
  readFileSync(new URL('../docs/react-refactor/inventory/copy-reference.json', import.meta.url), 'utf8')
) as StaticCopyReference;

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
        return html
          .replace('__SITE_LANGUAGE__', escapeAttribute(SITE_META.language))
          .replace('__SITE_DESCRIPTION__', escapeAttribute(SITE_META.description))
          .replace('__SITE_TITLE__', escapeAttribute(SITE_META.title))
          .replace('<!--__CANONICAL_LINK__-->', `<link rel="canonical" href="${SITE_META.canonicalPath}">`)
          .replace('<!--__STATIC_STORY_CONTENT__-->', renderStaticStoryShell(copyReference));
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), staticStoryShellPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'eslint-rules/**/*.test.mjs']
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    modulePreload: false,
    chunkSizeWarningLimit: 420,
    rollupOptions: {
      output: {
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
