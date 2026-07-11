import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { renderStaticStoryShell, type StaticCopyReference } from './build/static-shell';

const copyReference = JSON.parse(
  readFileSync(new URL('../docs/react-refactor/inventory/copy-reference.json', import.meta.url), 'utf8')
) as StaticCopyReference;

function staticStoryShellPlugin() {
  return {
    name: 'static-story-shell',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string) {
        return html
          .replace('<!--__CANONICAL_LINK__-->', '<link rel="canonical" href="/">')
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
    chunkSizeWarningLimit: 420
  }
});
