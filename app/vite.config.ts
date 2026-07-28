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

type PhoneCrossChunkContractPolicy = Readonly<{
  schemaVersion: number;
  reservedPropertyNames: readonly string[];
  retainedObjectContracts: readonly Readonly<{
    name: string;
    callees: readonly string[];
    sourceSuffixes: readonly string[];
    propertyNames: readonly string[];
  }>[];
}>;

const cdnReleasePolicy = JSON.parse(
  readFileSync(new URL('./build/cdn-release-policy.json', import.meta.url), 'utf8')
) as CdnReleasePolicy;
const phoneCrossChunkContractPolicy = JSON.parse(
  readFileSync(new URL('./build/phone-cross-chunk-contract.json', import.meta.url), 'utf8')
) as PhoneCrossChunkContractPolicy;
const releaseId = process.env.R5_RELEASE_ID?.trim() ?? '';
const requireCdn = process.env.R5_REQUIRE_CDN === '1';
const phoneStoryPrebootEnabled = process.env.VITE_ENABLE_PHONE_STORY === '1';
const assetCdnBase = (process.env.R5_ASSET_CDN_BASE?.trim() || 'https://assets.tongye.me')
  .replace(/\/+$/, '');
const mediaCdnBase = (process.env.R5_MEDIA_CDN_BASE?.trim() || 'https://media.tongye.me')
  .replace(/\/+$/, '');
const assetExtensions = new Set(cdnReleasePolicy.assetExtensions);
const mediaExtensions = new Set(cdnReleasePolicy.mediaExtensions);

if (cdnReleasePolicy.schemaVersion !== 1) {
  throw new Error(`unsupported CDN release policy schema: ${cdnReleasePolicy.schemaVersion}`);
}
if (phoneCrossChunkContractPolicy.schemaVersion !== 2) {
  throw new Error(
    `unsupported Phone cross-chunk contract schema: ${phoneCrossChunkContractPolicy.schemaVersion}`
  );
}
const phoneCrossChunkReservedProperties = new Set(
  phoneCrossChunkContractPolicy.reservedPropertyNames
);
for (const contract of phoneCrossChunkContractPolicy.retainedObjectContracts) {
  if (!contract.name || contract.callees.length === 0 || contract.sourceSuffixes.length === 0) {
    throw new Error('Phone cross-chunk retained object contract is incomplete');
  }
  const missing = contract.propertyNames.filter(
    (property) => !phoneCrossChunkReservedProperties.has(property)
  );
  if (missing.length > 0) {
    throw new Error(
      `Phone cross-chunk contract ${contract.name} has unreserved fields: ${missing.join(', ')}`
    );
  }
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
          .replace('__PHONE_STORY_PREBOOT_ENABLED__', String(phoneStoryPrebootEnabled))
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
      ecma: 2020,
      module: true,
      compress: {
        ecma: 2020,
        passes: 10,
        unsafe_arrows: true,
        unsafe: true,
        unsafe_comps: true,
        unsafe_math: true,
        unsafe_methods: true,
        unsafe_proto: true,
        unsafe_regexp: true,
        unsafe_undefined: true,
        pure_getters: true
      },
      format: { ecma: 2020 },
      mangle: {
        properties: {
          // These fields are private to React Fiber or to the internally
          // compiled phone snapshot graph. Keeping the allow-list explicit
          // leaves DOM and externally observable adapter contracts untouched.
          regex: /^(?:memoizedState|flags|stateNode|sibling|alternate|lanes|updateQueue|memoizedProps|pendingProps|subtreeFlags|childLanes|authorityId|diagnostics|lastRollback|completedEpoch|completedEpochUntil|sampleRevision|projection|operation|inputEpoch|anchor|alignment|geometryRevision|targetY|commandId|correctionCount|confirmedY|visualViewportOffsetTop|fallbackScene|cinematic|corridor|status|revision|scroll|input|sessionId|generation|legIndex|direction|phase|progress|actualY|run|scene|from|to|segment|runSource|runTarget|trigger|anchorY|commitState|checkpoint|edge|stageOwner|stageScene|sourceSurface|receiverSurface|effects|inputDisposition|boundaryKnown|crossedBoundary|scrollCorridors|hasPresentedSurface|sampleNow|scenes|sample|boundary|landing|viewportWidth|viewportHeight|reason|kind|source|directScene|disposed|resolveIntent|syncDiagnostics|registerRunCapability|registerSurface|registerScrollCorridor|registerTransitionEndpoints|clearTransitionEndpoints|reapplyCurrent|preflight|rootForScene|canStart|startAtLeg|reportPresentedFrame|reportProgress|reportEndpoints|reportEndpointCommit|reportTargetPresented|reportEndpointRelease|provideRelease|reportAnimationComplete|reportFailure|releaseGeometry|releaseResources|onNativeScrollCorrection|scrollState|wheelQuietMs|momentumWindowMs|requestFrame|cancelFrame|coverageRoot|presented|attach|coverageSurface|landingResolver|semanticScene|navigationScene|initialScene|scheduleFrame|ownerId|capability|dependencies|resume|valid|endpoints|checkpointTrace|retention|abortController|visualScenes|capabilities|reducedMotion|timeoutMs|directLegIndex|runId|preparation|boundaries|documentSurface)$/,
          reserved: [...phoneCrossChunkContractPolicy.reservedPropertyNames]
        }
      }
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
          // Keep the packed-alpha owner and its raw compositor configuration in
          // one dedicated lazy runtime. This is deliberately separate from the
          // timeline/Ink runtime: the bridge remains intra-chunk while neither
          // lazy runtime is allowed to grow past the release chunk budget.
          if ([
            '/src/production/phone/scenes/phone-packed-alpha-surface.ts',
            '/src/media/packed-alpha-video.ts'
          ].some((moduleId) => id.includes(moduleId))) {
            return 'phone-media-runtime';
          }
          if ([
            '/src/transitions/shared/ink.ts',
            '/src/transitions/shared/inkOwnership.ts',
            '/src/transitions/shared/sceneInk.ts',
            '/src/transitions/shared/phone-ink-runtime.ts',
            '/src/transitions/shared/radialInkIntro.ts',
            '/src/production/phone/phone-timeline-runtime.ts',
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
