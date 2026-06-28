#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(rootDir, 'output/playwright');
const DEFAULT_PORT = 8138;
const DEFAULT_HOST = '127.0.0.1';
const STABILIZATION_TIMEOUT_MS = 10000;
const STABILIZATION_HARD_TIMEOUT_MS = 30000;
const STABILIZATION_SAMPLE_MS = 160;
const STABILIZATION_STABLE_SAMPLES = 3;

const DESKTOP_CHECKPOINTS = [
  0, 736, 886, 919,
  1293, 1299, 1310, 1699, 1843, 2327,
  2700, 2920, 2937, 3100, 3300, 3767, 4598, 5368,
  6198, 6451, 6745, 6762, 6885, 6920, 7873, 8703, 9535,
  9954, 10784, 11616, 12139, 12417,
  13177, 14007, 14839,
  16059, 16438, 17268, 18097, 18523
];

const MOBILE_SMOKE_CHECKPOINTS = [0, 919, 4598, 12417, 18523];

const VIEWPORTS = [
  {
    id: 'desktop-1440x840',
    viewport: { width: 1440, height: 840 },
    checkpoints: DESKTOP_CHECKPOINTS
  },
  {
    id: 'mobile-390x844',
    viewport: { width: 390, height: 844 },
    checkpoints: MOBILE_SMOKE_CHECKPOINTS
  }
];

const CROSSWALK = [
  { issue: 0, checkpoints: [0, 886, 919], phase: 'nav blur depth', transitionIds: ['home-belief'], gate: 'nav-blur-depth' },
  { issue: 1, checkpoints: [736, 886, 919], phase: 'home pattern continuity', transitionIds: ['home-belief'], gate: 'home-pattern-no-dark-gap' },
  { issue: 2, checkpoints: [1293, 1310, 1699], phase: 'belief copy', transitionIds: ['home-belief'], gate: 'belief-manifesto-copy' },
  { issue: 3, checkpoints: [1299, 1843, 2327], phase: 'belief star split', transitionIds: ['home-belief'], gate: 'belief-star-split' },
  { issue: 4, checkpoints: [3100, 3300], phase: 'belief aod entry', transitionIds: ['belief-method'], gate: 'belief-aod-entry' },
  { issue: 5, checkpoints: [2920, 3767, 4598], phase: 'aod scene visible', transitionIds: ['belief-method'], gate: 'aod-scene-visible' },
  { issue: 6, checkpoints: [4598, 5368], phase: 'aod method receiver', transitionIds: ['belief-method'], gate: 'aod-method-receiver' },
  { issue: 7, checkpoints: [5368, 6198, 6451], phase: 'method figure2 entry', transitionIds: ['method-tooling__method-proof'], gate: 'method-figure2-entry' },
  { issue: 8, checkpoints: [6745, 6885, 6920, 7873], phase: 'figure2 exit', transitionIds: ['method-tooling__method-proof', 'brand-services'], gate: 'figure2-exit-no-blank' },
  { issue: 9, checkpoints: [7873, 8703, 9535], phase: 'figure3 services receiver', transitionIds: ['brand-services'], gate: 'figure3-services-receiver' },
  { issue: 10, checkpoints: [9535, 9954, 10784, 11616], phase: 'services ttg lab split', transitionIds: ['services-lab'], gate: 'services-ttg-lab-split' },
  { issue: 11, checkpoints: [11616], phase: 'lab dividers', transitionIds: ['services-lab'], gate: 'lab-independent-dividers' },
  { issue: 12, checkpoints: [12139, 12417], phase: 'lab column rhythm', transitionIds: [], gate: 'lab-column-rhythm' },
  { issue: 13, checkpoints: [12417, 13177, 14007, 14839], phase: 'lab ph education split', transitionIds: ['lab-education'], gate: 'lab-ph-education-split' },
  { issue: 14, checkpoints: [14839], phase: 'education dividers', transitionIds: ['lab-education'], gate: 'education-independent-dividers' },
  { issue: 15, checkpoints: [14839], phase: 'education column rhythm', transitionIds: [], gate: 'education-column-rhythm' },
  { issue: 16, checkpoints: [16059, 16438], phase: 'philosophy no empty field', transitionIds: ['philosophy-contact'], gate: 'philosophy-no-empty-field' },
  { issue: 17, checkpoints: [16059, 16438, 17268, 18097], phase: 'crane contact receiver', transitionIds: ['philosophy-contact'], gate: 'crane-contact-receiver' },
  { issue: 18, checkpoints: [18097, 18523], phase: 'contact endpoint', transitionIds: ['philosophy-contact'], gate: 'contact-endpoint-real' }
];

const CAPTURE_MODES = new Set(['fresh', 'forward', 'reverse', 'direct-jump', 'all']);

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ttf', 'font/ttf'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function parseArgs(argv) {
  const options = {
    url: '',
    outputName: '',
    headed: false,
    noMobile: false,
    mode: 'fresh'
  };

  for (const arg of argv) {
    if (arg.startsWith('--url=')) options.url = arg.slice('--url='.length);
    else if (arg.startsWith('--output-name=')) options.outputName = arg.slice('--output-name='.length);
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--no-mobile' || arg === '--desktop-only') options.noMobile = true;
    else if (arg.startsWith('--mode=')) options.mode = arg.slice('--mode='.length);
  }

  if (!CAPTURE_MODES.has(options.mode)) {
    throw new Error(`Invalid --mode=${options.mode}. Expected one of: ${[...CAPTURE_MODES].join(', ')}`);
  }

  return options;
}

function timestampName() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:.]/g, '-');
}

function withCalibrationParam(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('calibrate', 'timeline');
  return url.toString();
}

function normalizeRequestPath(urlPath) {
  const cleanedPath = decodeURIComponent(urlPath).replace(/^\/+/, '').replace(/\/+$/, '');
  return cleanedPath ? (path.extname(cleanedPath) ? cleanedPath : `${cleanedPath}.html`) : 'index.html';
}

async function startStaticServer({ host = DEFAULT_HOST, preferredPort = DEFAULT_PORT } = {}) {
  let port = preferredPort;
  let server;

  while (port < preferredPort + 40) {
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
        const filePath = path.normalize(path.join(rootDir, normalizeRequestPath(url.pathname)));
        const rootWithSep = path.normalize(rootDir + path.sep);

        if (!filePath.startsWith(rootWithSep)) {
          response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Forbidden');
          return;
        }

        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found');
          return;
        }

        const range = request.headers.range;
        const commonHeaders = {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
        };

        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          const start = match?.[1] ? Number(match[1]) : 0;
          const end = match?.[2] ? Number(match[2]) : fileStat.size - 1;
          if (!match || start >= fileStat.size || end >= fileStat.size || start > end) {
            response.writeHead(416, { 'Content-Range': `bytes */${fileStat.size}` });
            response.end();
            return;
          }
          response.writeHead(206, {
            ...commonHeaders,
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${fileStat.size}`
          });
          createReadStream(filePath, { start, end }).pipe(response);
          return;
        }

        response.writeHead(200, {
          ...commonHeaders,
          'Content-Length': fileStat.size
        });
        createReadStream(filePath).pipe(response);
      } catch (error) {
        const status = error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? 404 : 500;
        response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(status === 404 ? 'Not found' : 'Internal server error');
      }
    });

    const started = await new Promise((resolve) => {
      const cleanup = () => {
        server.off('error', onError);
        server.off('listening', onListening);
      };
      const onError = (error) => {
        cleanup();
        resolve(error.code === 'EADDRINUSE' ? false : error);
      };
      const onListening = () => {
        cleanup();
        resolve(true);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });

    if (started === true) {
      return {
        url: `http://${host}:${port}/index.html`,
        close: () => new Promise((resolve) => server.close(resolve))
      };
    }

    if (started instanceof Error) throw started;
    port += 1;
  }

  throw new Error(`No free local port found from ${preferredPort} to ${preferredPort + 39}.`);
}

async function waitForPageReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => document.body.classList.contains('is-loader-hidden'), null, {
    timeout: 9000
  }).catch(() => {});
  await page.waitForTimeout(600);
}

async function stabilizeScroll(page, requestedY) {
  await page.evaluate((y) => {
    window.scrollTo({ top: y, left: 0, behavior: 'auto' });
  }, requestedY);

  const startedAt = Date.now();
  const readings = [];
  let actualY = await page.evaluate(() => window.scrollY || window.pageYOffset || 0);

  while (Date.now() - startedAt < STABILIZATION_HARD_TIMEOUT_MS) {
    await page.waitForTimeout(STABILIZATION_SAMPLE_MS);
    actualY = await page.evaluate(() => window.scrollY || window.pageYOffset || 0);
    readings.push(actualY);
    if (readings.length > STABILIZATION_STABLE_SAMPLES) readings.shift();
    if (readings.length < STABILIZATION_STABLE_SAMPLES) continue;
    const drift = Math.max(...readings) - Math.min(...readings);
    if (drift < 0.5) break;
    if (Date.now() - startedAt >= STABILIZATION_TIMEOUT_MS) break;
  }

  const finalDrift = readings.length
    ? Math.max(...readings) - Math.min(...readings)
    : 0;

  return {
    requestedY,
    actualY: Math.round(actualY),
    residualScrollDelta: Number(finalDrift.toFixed(3)),
    stabilizationWaitMs: Date.now() - startedAt,
    stabilizationSampleCount: readings.length,
    stabilizationTimedOut: Date.now() - startedAt >= STABILIZATION_TIMEOUT_MS,
    stabilized: readings.length >= STABILIZATION_STABLE_SAMPLES && finalDrift < 0.5
  };
}

function screenshotName({ requestedY, actualY, viewportId }) {
  const requested = String(Math.round(requestedY)).padStart(5, '0');
  const actual = String(Math.round(actualY)).padStart(5, '0');
  return `${viewportId}-request-${requested}-actual-${actual}.png`;
}

async function collectState(page, scrollState, viewport, direction, screenshotPath) {
  return page.evaluate(({ scrollState, viewport, direction, screenshotPath }) => {
    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const number = (value, fallback = 0) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const box = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        left: Number(rect.left.toFixed(2))
      };
    };
    const areaInViewport = (rect) => {
      if (!rect) return 0;
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      return width * height;
    };
    const fullArea = (rect) => Math.max(0, rect?.width || 0) * Math.max(0, rect?.height || 0);
    const visibleRatio = (rect) => {
      const area = fullArea(rect);
      return area > 0 ? Number((areaInViewport(rect) / area).toFixed(4)) : 0;
    };
    const isRendered = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && number(style.opacity, 1) > 0.01;
    };
    const blurPx = (style) => {
      const filter = style.filter || '';
      const match = /blur\(([-0-9.]+)px\)/.exec(filter);
      return match ? number(match[1], 0) : 0;
    };
    const safeMargin = (rect, margin = 24) => Boolean(
      rect
      && rect.top >= margin
      && rect.left >= margin
      && rect.right <= window.innerWidth - margin
      && rect.bottom <= window.innerHeight - margin
    );
    const summarizeSelector = (element) => {
      if (!element) return '';
      if (element.id) return `#${element.id}`;
      if (element.dataset?.sectionId) return `[data-section-id="${element.dataset.sectionId}"]`;
      if (element.dataset?.transitionId) return `[data-transition-id="${element.dataset.transitionId}"]`;
      if (element.dataset?.sceneId) return `[data-scene-id="${element.dataset.sceneId}"]`;
      const className = String(element.className || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      return `${element.tagName.toLowerCase()}${className ? `.${className}` : ''}`;
    };
    const isMeasurementChrome = (element) => Boolean(
      element?.matches?.('.loader-ink-reveal, [data-loader-ink-canvas], .grain, .cursor-glow')
      || element?.closest?.([
        '.site-nav',
        '.scroll-edge-blur',
        '.loading-screen',
        '.master-observer-hud',
        '[data-master-observer-hud]'
      ].join(','))
    );
    const elementState = (element, extra = {}) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = box(element);
      return {
        selector: summarizeSelector(element),
        id: element.id || '',
        className: String(element.className || ''),
        opacity: number(style.opacity, 1),
        visibility: style.visibility,
        display: style.display,
        blurPx: blurPx(style),
        bbox: rect,
        visibleRatio: visibleRatio(rect),
        safeMargin: safeMargin(rect),
        ...extra
      };
    };
    function sampledCanvasActivePixelRatio(canvas, threshold = 8) {
      try {
        const width = Math.max(1, Math.min(96, canvas.width || 0));
        const height = Math.max(1, Math.min(54, canvas.height || 0));
        if (!width || !height) return { ratio: 0, source: 'unavailable' };

        const scratch = document.createElement('canvas');
        scratch.width = width;
        scratch.height = height;
        const context = scratch.getContext('2d', { willReadFrequently: true });
        if (!context) return { ratio: 0, source: 'unavailable' };

        context.drawImage(canvas, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        let active = 0;
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] >= threshold) active += 1;
        }
        return {
          ratio: Number((active / (width * height)).toFixed(4)),
          source: 'sampled-canvas'
        };
      } catch {
        return { ratio: 0, source: 'blocked' };
      }
    }
    const pickLargest = (elements) => {
      let best = null;
      let bestArea = 0;
      for (const element of elements) {
        if (isMeasurementChrome(element)) continue;
        if (!isRendered(element)) continue;
        const rect = element.getBoundingClientRect();
        const area = areaInViewport(rect);
        if (area > bestArea) {
          best = element;
          bestArea = area;
        }
      }
      return best;
    };
    const hud = document.querySelector('[data-master-observer-hud]');
    const hudFields = hud
      ? [...hud.querySelectorAll('[data-master-observer-field]')].reduce((fields, field) => {
        fields[field.dataset.masterObserverField] = field.textContent.trim();
        return fields;
      }, {})
      : {};
    const sections = [
      document.getElementById('home'),
      ...document.querySelectorAll('section[data-section-id]')
    ].filter(Boolean);
    const transitions = [
      ...document.querySelectorAll('.chapter-transition[data-transition-id], .scene-transition[data-transition-id]')
    ];
    const activeSection = pickLargest(sections);
    const activeTransition = pickLargest(transitions);
    const copyCandidates = [
      ['hero', '#home .hero-content'],
      ['belief', '#belief .belief-copy-wrap'],
      ['method', '#method .chapter-intro--method'],
      ['proof', '.figure2-proof-scroll .method-proof, #method .method-proof'],
      ['brand', '#brand .brand-definition-grid'],
      ['services', '#services .enterprise-vertical-layout'],
      ['lab', '#lab .scenario-wide-stage'],
      ['education', '#education .education-vertical-layout'],
      ['philosophy', '#philosophy .philosophy-list'],
      ['contact', '#contact .contact-endpoint']
    ];
    const copyStates = copyCandidates.map(([id, selector]) => {
      const element = document.querySelector(selector);
      return elementState(element, {
        copyId: id,
        selector
      });
    }).filter(Boolean);
    const visibleCopies = copyStates.filter((state) => state.visibleRatio > 0 && state.opacity > 0.03);
    const primaryCopy = visibleCopies.sort((a, b) => b.visibleRatio - a.visibleRatio)[0] || null;
    const splitBridgeStates = [...document.querySelectorAll('[data-split-scene-bridge]')].map((bridge) => {
      const style = getComputedStyle(bridge);
      const rect = box(bridge);
      const active = bridge.dataset.splitActive === 'true'
        || (style.visibility !== 'hidden' && number(style.opacity, 0) > 0.05 && areaInViewport(bridge.getBoundingClientRect()) > 0);
      const previousLayer = bridge.querySelector('[data-split-layer="previous"]');
      const nextLayer = bridge.querySelector('[data-split-layer="next"]');
      const edgePercent = number(bridge.dataset.splitEdgeY || style.getPropertyValue('--split-edge-y'), 50);
      const edgeRatio = clamp(edgePercent / 100);
      const topHeight = Math.max(0, Math.min(window.innerHeight, (rect?.top || 0) + (rect?.height || window.innerHeight) * edgeRatio) - Math.max(0, rect?.top || 0));
      const bottomHeight = Math.max(0, Math.min(window.innerHeight, rect?.bottom || window.innerHeight) - Math.max(0, (rect?.top || 0) + (rect?.height || window.innerHeight) * edgeRatio));
      const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
      const previousTopPixelRatio = active && previousLayer
        ? Number(((Math.max(0, rect?.width || window.innerWidth) * topHeight) / viewportArea).toFixed(4))
        : 0;
      const nextBottomPixelRatio = active && nextLayer
        ? Number(((Math.max(0, rect?.width || window.innerWidth) * bottomHeight) / viewportArea).toFixed(4))
        : 0;

      return elementState(bridge, {
        transitionId: bridge.dataset.transitionId || bridge.closest('[data-transition-id]')?.dataset.transitionId || '',
        active,
        claimedTopOwner: bridge.dataset.claimedTopOwner || bridge.dataset.splitTopOwner || '',
        claimedBottomOwner: bridge.dataset.claimedBottomOwner || bridge.dataset.splitBottomOwner || '',
        previousReadyClaim: bridge.dataset.previousReadyClaim || bridge.dataset.previousReady || '',
        nextReadyClaim: bridge.dataset.nextReadyClaim || bridge.dataset.nextReady || '',
        splitProgressClaim: number(bridge.dataset.splitProgressClaim || bridge.dataset.splitProgress, null),
        previousTopPixelRatio,
        previousTopPixelRatioSource: previousTopPixelRatio > 0 ? 'sampled-dom-geometry' : 'unavailable',
        nextBottomPixelRatio,
        nextBottomPixelRatioSource: nextBottomPixelRatio > 0 ? 'sampled-dom-geometry' : 'unavailable',
        topOwnerElementHit: active && Boolean(previousLayer) && previousTopPixelRatio >= 0.015,
        bottomOwnerElementHit: active && Boolean(nextLayer) && nextBottomPixelRatio >= 0.015,
        topLayer: elementState(previousLayer),
        bottomLayer: elementState(nextLayer)
      });
    }).filter(Boolean);
    const receiverStates = [...document.querySelectorAll('[data-handoff-receiver], .homepage-handoff-receiver')]
      .map((element) => elementState(element, {
        handoffProgress: number(element.dataset.handoffProgress, number(getComputedStyle(element).getPropertyValue('--handoff-receiver-opacity'), 0)),
        source: element.dataset.handoffSource || '',
        mode: element.dataset.handoffMode || 'adopt'
      }))
      .filter(Boolean);
    const videoStates = [...document.querySelectorAll('video')].map((video) => {
      const rect = box(video);
      return {
        selector: summarizeSelector(video),
        src: (video.currentSrc || video.src || '').split('/').pop() || '',
        currentTime: Number((video.currentTime || 0).toFixed(3)),
        duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : null,
        progress: Number.isFinite(video.duration) && video.duration > 0
          ? Number(clamp(video.currentTime / video.duration).toFixed(4))
          : null,
        paused: video.paused,
        bbox: rect,
        visibleRatio: visibleRatio(rect),
        opacity: number(getComputedStyle(video).opacity, 1)
      };
    });
    const canvasStates = [...document.querySelectorAll('canvas')].map((canvas) => {
      const rect = box(canvas);
      return {
        selector: summarizeSelector(canvas),
        width: canvas.width,
        height: canvas.height,
        bbox: rect,
        visibleRatio: visibleRatio(rect),
        opacity: number(getComputedStyle(canvas).opacity, 1)
      };
    });
    const inkSurfaceStates = [...document.querySelectorAll([
      '[data-transition-ink-surface]',
      '[data-aod-ink-canvas]',
      '[data-figure2-ink-canvas]',
      '.pattern-bloom-transition__reveal-ink',
      '.pattern-bloom-transition__exit-ink'
    ].join(','))].map((canvas) => {
      const style = getComputedStyle(canvas);
      const progress = number(canvas.dataset.inkProgress, number(style.opacity, 0));
      const opacity = number(style.opacity, 0);
      const sampled = sampledCanvasActivePixelRatio(canvas);
      const estimatedActivePixelRatio = number(
        canvas.dataset.inkActivePixelRatio,
        opacity > 0.18 ? Math.min(progress, 1) * 0.06 : 0
      );
      const activePixelRatio = sampled.source === 'sampled-canvas' ? sampled.ratio : 0;
      return elementState(canvas, {
        transitionId: canvas.dataset.transitionId || canvas.closest('[data-transition-id]')?.dataset.transitionId || '',
        kind: canvas.dataset.inkKind || canvas.dataset.transitionInkKind || 'unknown',
        progress,
        activePixelRatio,
        activePixelRatioSource: sampled.source,
        estimatedActivePixelRatio,
        inkEvidenceStatus: sampled.source === 'sampled-canvas' ? 'sampled' : 'not-sampled',
        textureReady: canvas.dataset.inkTextureReady !== 'false',
        active: opacity >= 0.18
          && progress >= 0.05
          && sampled.source === 'sampled-canvas'
          && activePixelRatio >= 0.015
      });
    }).filter(Boolean);
    const sceneStates = transitions.map((transition) => elementState(transition, {
      transitionId: transition.dataset.transitionId || '',
      module: transition.dataset.transitionModule || '',
      phase: transition.dataset.transitionPhase || '',
      bridgeType: transition.dataset.transitionBridgeType || '',
      progress: number(transition.dataset.transitionProgress, null),
      sceneOpacity: number(transition.dataset.transitionSceneOpacity, null),
      inkProgress: number(transition.dataset.transitionInkProgress, null),
      foregroundOpacity: number(transition.dataset.transitionForegroundOpacity, null),
      snapTarget: transition.dataset.transitionSnapTarget || transition.dataset.transitionHandoffTarget || '',
      snapState: transition.dataset.snapState || '',
      receiverOpacity: number(transition.dataset.transitionReceiverOpacity, null)
    })).filter(Boolean);
    const foregroundSelectors = [
      '[data-transition-ghost]',
      '.figure2-arch-layer--near-arch',
      '.figure2-arch-layer--front',
      '.ttg-layer--front',
      '.ph-layer--front',
      '.crane-layer--arch',
      'video',
      'canvas'
    ].join(',');
    const activeTransitionRatio = visibleRatio(box(activeTransition));
    const foregroundScope = activeTransition && activeTransitionRatio > 0.02 ? activeTransition : null;
    const foregroundCandidates = foregroundScope
      ? [...foregroundScope.querySelectorAll(foregroundSelectors)].filter((element) => (
        !isMeasurementChrome(element)
        && !element.closest('.homepage-handoff-receiver')
      ))
      : [];
    const foreground = elementState(pickLargest(foregroundCandidates), {
      role: 'dominant-foreground'
    });
    const intersectionArea = (a, b) => {
      if (!a || !b) return 0;
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return width * height;
    };
    const primaryCopyArea = fullArea(primaryCopy?.bbox);
    const overlapArea = intersectionArea(primaryCopy?.bbox, foreground?.bbox);
    const lineOwners = [];
    const boundaryBandTop = Math.max(96, window.innerHeight * 0.12);
    const boundaryBandBottom = window.innerHeight;
    const isInBoundaryBand = (y) => y >= boundaryBandTop && y <= boundaryBandBottom;
    for (const element of document.querySelectorAll('body *')) {
      if (lineOwners.length >= 120) break;
      if (isMeasurementChrome(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.width <= 0) continue;
      const style = getComputedStyle(element);
      const borderTop = number(style.borderTopWidth, 0);
      const borderBottom = number(style.borderBottomWidth, 0);
      if (borderTop >= 0.75 && isInBoundaryBand(rect.top)) {
        lineOwners.push({
          owner: summarizeSelector(element),
          edge: 'top',
          y: Number(rect.top.toFixed(2)),
          color: style.borderTopColor,
          width: borderTop
        });
      }
      if (borderBottom >= 0.75 && isInBoundaryBand(rect.bottom)) {
        lineOwners.push({
          owner: summarizeSelector(element),
          edge: 'bottom',
          y: Number(rect.bottom.toFixed(2)),
          color: style.borderBottomColor,
          width: borderBottom
        });
      }
      for (const pseudo of ['::before', '::after']) {
        const pseudoStyle = getComputedStyle(element, pseudo);
        if (pseudoStyle.display === 'none' || pseudoStyle.content === 'none') continue;
        const pseudoHeight = number(pseudoStyle.height, 0);
        const pseudoY = pseudo === '::after' ? rect.bottom : rect.top;
        if (pseudoHeight >= 1 && pseudoHeight <= 140 && isInBoundaryBand(pseudoY)) {
          lineOwners.push({
            owner: `${summarizeSelector(element)}${pseudo}`,
            edge: pseudo,
            y: Number(pseudoY.toFixed(2)),
            color: pseudoStyle.backgroundColor,
            width: pseudoHeight
          });
        }
      }
    }
    const contactBox = box(document.querySelector('#contact'));
    const footerBox = box(document.querySelector('footer'));
    const leftRhythmBox = box(document.querySelector('#lab .chapter-intro, #services .chapter-intro, #education .education-vertical-lead'));
    const rightRhythmBox = box(document.querySelector('#lab .scenario-list, #services .enterprise-list, #education .education-list'));
    const labLeftRhythmBox = box(document.querySelector('#lab .chapter-intro'));
    const labRightRhythmBox = box(document.querySelector('#lab .scenario-list'));
    const educationLeftRhythmBox = box(document.querySelector('#education .education-vertical-lead'));
    const educationRightRhythmBox = box(document.querySelector('#education .education-list'));
    const rhythmDeltaPx = leftRhythmBox && rightRhythmBox
      ? Number((rightRhythmBox.top - leftRhythmBox.top).toFixed(2))
      : null;
    const labRhythmDeltaPx = labLeftRhythmBox && labRightRhythmBox
      ? Number((labRightRhythmBox.top - labLeftRhythmBox.top).toFixed(2))
      : null;
    const educationRhythmDeltaPx = educationLeftRhythmBox && educationRightRhythmBox
      ? Number((educationRightRhythmBox.top - educationLeftRhythmBox.top).toFixed(2))
      : null;
    const nav = document.querySelector('.site-nav');
    const navBlur = document.querySelector('.scroll-edge-blur');
    const navBox = box(nav);
    const navBlurBox = box(navBlur);
    const contactPrimaryCta = document.querySelector('#contact .contact-actions .btn-primary');
    const snapTargetSelector = document.documentElement.dataset.homepageEndpointSnapTarget || '';
    const snapTargetBox = box(snapTargetSelector ? document.querySelector(snapTargetSelector) : null);
    const snapDeltaPx = snapTargetBox ? Math.abs(snapTargetBox.top) : null;

    return {
      requestedY: scrollState.requestedY,
      actualY: scrollState.actualY,
      maxY: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      direction,
      captureMode: scrollState.captureMode || 'fresh-page',
      sequenceId: scrollState.sequenceId || '',
      sequenceIndex: scrollState.sequenceIndex ?? null,
      fromRequestedY: scrollState.fromRequestedY ?? null,
      reversePrimed: scrollState.reversePrimed || false,
      viewport,
      stabilization: {
        waitMs: scrollState.stabilizationWaitMs,
        residualScrollDelta: scrollState.residualScrollDelta,
        sampleCount: scrollState.stabilizationSampleCount,
        timedOut: scrollState.stabilizationTimedOut,
        stabilized: scrollState.stabilized
      },
      bodyClass: document.body.className,
      htmlDataset: { ...document.documentElement.dataset },
      hudFields,
      activeSection: activeSection ? {
        id: activeSection.id || activeSection.dataset.sectionId || '',
        selector: summarizeSelector(activeSection),
        bbox: box(activeSection),
        visibleRatio: visibleRatio(box(activeSection))
      } : null,
      activeTransition: activeTransition ? {
        id: activeTransition.dataset.transitionId || '',
        module: activeTransition.dataset.transitionModule || '',
        phase: activeTransition.dataset.transitionPhase || 'none',
        bridgeType: activeTransition.dataset.transitionBridgeType || 'none',
        progress: number(activeTransition.dataset.transitionProgress, null),
        receiverOpacity: number(activeTransition.dataset.transitionReceiverOpacity, null),
        snapTarget: activeTransition.dataset.transitionSnapTarget || activeTransition.dataset.transitionHandoffTarget || '',
        snapState: activeTransition.dataset.snapState || '',
        bbox: box(activeTransition),
        visibleRatio: visibleRatio(box(activeTransition))
      } : null,
      transitionContext: {
        transitionId: activeTransition?.dataset.transitionId || '',
        phase: activeTransition?.dataset.transitionPhase || 'none',
        bridgeType: activeTransition?.dataset.transitionBridgeType || 'none',
        progress: number(activeTransition?.dataset.transitionProgress, null),
        sceneOpacity: number(activeTransition?.dataset.transitionSceneOpacity, null),
        receiverOpacity: number(activeTransition?.dataset.transitionReceiverOpacity, null),
        inkProgress: number(activeTransition?.dataset.transitionInkProgress, null),
        foregroundOpacity: number(activeTransition?.dataset.transitionForegroundOpacity, null)
      },
      copy: {
        id: primaryCopy?.copyId || 'none',
        primary: primaryCopy,
        all: copyStates
      },
      receivers: receiverStates,
      splitBridges: splitBridgeStates,
      scenes: sceneStates,
      videos: videoStates,
      canvases: canvasStates,
      inkSurfaces: inkSurfaceStates,
      overlap: {
        primaryCopyBbox: primaryCopy?.bbox || null,
        dominantForegroundBbox: foreground?.bbox || null,
        dominantForeground: foreground,
        overlapArea: Number(overlapArea.toFixed(2)),
        overlapRatio: primaryCopyArea > 0 ? Number((overlapArea / primaryCopyArea).toFixed(4)) : 0
      },
      boundaries: {
        band: {
          top: Number(boundaryBandTop.toFixed(2)),
          bottom: Number(boundaryBandBottom.toFixed(2)),
          excludes: ['nav', 'HUD', 'loader', 'global chrome']
        },
        lineCount: lineOwners.length,
        lineOwners
      },
      endpoint: {
        chosenEndpointSpec: {
          mode: document.documentElement.dataset.homepageEndpointMode || 'undecided',
          snapTarget: document.documentElement.dataset.homepageEndpointSnapTarget || '',
          footerVisibleRatioMin: number(document.documentElement.dataset.homepageEndpointFooterMin, null),
          footerVisibleRatioMax: number(document.documentElement.dataset.homepageEndpointFooterMax, null),
          tolerancePx: number(document.documentElement.dataset.homepageEndpointTolerancePx, null),
          approvalSource: document.documentElement.dataset.homepageEndpointApprovalSource || ''
        },
        contactBbox: contactBox,
        footerBbox: footerBox,
        footerVisibleRatio: visibleRatio(footerBox),
        snapDeltaPx,
        primaryCtaHref: contactPrimaryCta?.getAttribute('href') || '',
        primaryCtaText: contactPrimaryCta?.textContent?.trim() || '',
        primaryCtaBbox: box(contactPrimaryCta),
        primaryCtaOpacity: contactPrimaryCta ? number(getComputedStyle(contactPrimaryCta).opacity, 1) : null
      },
      nav: {
        navBbox: navBox,
        blurBbox: navBlurBox,
        blurHeightPx: navBlurBox?.height ?? null,
        navHeightPx: navBox?.height ?? null,
        blurToNavHeightRatio: navBox?.height ? Number(((navBlurBox?.height || 0) / navBox.height).toFixed(3)) : null,
        blurVisible: Boolean(navBlur && isRendered(navBlur)),
        navVisible: Boolean(nav && isRendered(nav))
      },
      copyMetrics: {
        beliefManifesto: elementState(document.querySelector('.belief-manifesto-note')),
        labLeft: elementState(document.querySelector('#lab .chapter-intro')),
        labRight: elementState(document.querySelector('#lab .scenario-list')),
        educationLeft: elementState(document.querySelector('#education .education-vertical-lead')),
        educationRight: elementState(document.querySelector('#education .education-list'))
      },
      layoutMetrics: {
        leftColumnTop: leftRhythmBox?.top ?? null,
        rightColumnTop: rightRhythmBox?.top ?? null,
        rhythmDeltaPx,
        labRhythmDeltaPx,
        educationRhythmDeltaPx
      },
      artifact: {
        screenshot: screenshotPath,
        hudVisibleScreenshot: null,
        jsonPath: null
      }
    };
  }, { scrollState, viewport, direction, screenshotPath });
}

async function captureHudHiddenStateAndScreenshot(page, scrollState, viewport, direction, screenshotPath) {
  await page.evaluate(() => {
    const hud = document.querySelector('[data-master-observer-hud]');
    if (!hud) return;
    hud.dataset.captureHidden = 'true';
    hud.style.setProperty('display', 'none', 'important');
  });
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const state = await collectState(page, scrollState, viewport, direction, screenshotPath);
  await page.evaluate(() => {
    const hud = document.querySelector('[data-master-observer-hud]');
    if (!hud) return;
    hud.style.removeProperty('display');
    delete hud.dataset.captureHidden;
  });
  return state;
}

async function captureViewportFresh({ browser, baseUrl, outputDir, viewportConfig, consoleMessages }) {
  const context = await browser.newContext({
    viewport: viewportConfig.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference'
  });
  const samples = [];
  let previousActualY = 0;

  for (const requestedY of viewportConfig.checkpoints) {
    const page = await context.newPage();
    page.on('console', (message) => {
      consoleMessages.push({
        viewport: viewportConfig.id,
        requestedY,
        type: message.type(),
        text: message.text()
      });
    });

    await page.goto(withCalibrationParam(baseUrl), { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({
      content: 'html, body, * { scroll-behavior: auto !important; }'
    });
    await waitForPageReady(page);

    const scrollState = {
      ...await stabilizeScroll(page, requestedY),
      captureMode: 'fresh-page'
    };
    const direction = scrollState.actualY >= previousActualY ? 'forward' : 'reverse';
    previousActualY = scrollState.actualY;
    const screenshotPath = path.join(outputDir, screenshotName({
      requestedY,
      actualY: scrollState.actualY,
      viewportId: viewportConfig.id
    }));
    const state = await captureHudHiddenStateAndScreenshot(
      page,
      scrollState,
      viewportConfig.viewport,
      direction,
      screenshotPath
    );
    state.artifact.screenshot = screenshotPath;
    samples.push(state);
    console.log(`${viewportConfig.id} ${requestedY}px -> ${scrollState.actualY}px (${state.activeTransition?.id || state.activeSection?.id || 'none'}:${state.activeTransition?.phase || 'none'})`);
    await page.close();
  }

  await context.close();
  return samples;
}

async function captureViewportDirectJump({ browser, baseUrl, outputDir, viewportConfig, consoleMessages }) {
  const context = await browser.newContext({
    viewport: viewportConfig.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference'
  });
  const samples = [];

  for (const requestedY of viewportConfig.checkpoints) {
    const page = await context.newPage();
    page.on('console', (message) => {
      consoleMessages.push({
        viewport: viewportConfig.id,
        requestedY,
        mode: 'direct-jump',
        type: message.type(),
        text: message.text()
      });
    });

    await page.goto(withCalibrationParam(baseUrl), { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({
      content: 'html, body, * { scroll-behavior: auto !important; }'
    });
    await waitForPageReady(page);
    await page.evaluate((y) => {
      window.scrollTo({ top: y, left: 0, behavior: 'auto' });
      window.dispatchEvent(new Event('homepage-direct-jump-capture'));
    }, requestedY);

    const scrollState = {
      ...await stabilizeScroll(page, requestedY),
      captureMode: 'direct-jump'
    };
    const screenshotPath = path.join(outputDir, screenshotName({
      requestedY,
      actualY: scrollState.actualY,
      viewportId: `${viewportConfig.id}-direct`
    }));
    const state = await captureHudHiddenStateAndScreenshot(
      page,
      scrollState,
      viewportConfig.viewport,
      'direct',
      screenshotPath
    );
    state.artifact.screenshot = screenshotPath;
    samples.push(state);
    console.log(`${viewportConfig.id} direct ${requestedY}px -> ${scrollState.actualY}px (${state.activeTransition?.id || state.activeSection?.id || 'none'}:${state.activeTransition?.phase || 'none'})`);
    await page.close();
  }

  await context.close();
  return samples;
}

async function captureViewportSequence({ browser, baseUrl, outputDir, viewportConfig, consoleMessages, direction }) {
  const context = await browser.newContext({
    viewport: viewportConfig.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference'
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    consoleMessages.push({
      viewport: viewportConfig.id,
      requestedY: null,
      mode: `same-page-${direction}`,
      type: message.type(),
      text: message.text()
    });
  });

  await page.goto(withCalibrationParam(baseUrl), { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: 'html, body, * { scroll-behavior: auto !important; }' });
  await waitForPageReady(page);

  const checkpoints = direction === 'reverse'
    ? [...viewportConfig.checkpoints].reverse()
    : viewportConfig.checkpoints;
  const samples = [];
  let previousRequestedY = null;
  let reversePrimed = false;

  if (direction === 'reverse') {
    const reverseStartY = Math.min(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
      Math.max(...viewportConfig.checkpoints) + viewportConfig.viewport.height
    );
    await stabilizeScroll(page, reverseStartY);
    previousRequestedY = reverseStartY;
    reversePrimed = true;
  }

  for (let index = 0; index < checkpoints.length; index += 1) {
    const requestedY = checkpoints[index];
    const scrollState = {
      ...await stabilizeScroll(page, requestedY),
      captureMode: `same-page-${direction}`,
      sequenceId: `${viewportConfig.id}-${direction}`,
      sequenceIndex: index,
      fromRequestedY: previousRequestedY,
      reversePrimed
    };
    previousRequestedY = requestedY;
    const screenshotPath = path.join(outputDir, screenshotName({
      requestedY,
      actualY: scrollState.actualY,
      viewportId: `${viewportConfig.id}-${direction}`
    }));
    const state = await captureHudHiddenStateAndScreenshot(
      page,
      scrollState,
      viewportConfig.viewport,
      direction,
      screenshotPath
    );
    state.artifact.screenshot = screenshotPath;
    samples.push(state);
    console.log(`${viewportConfig.id} ${direction} ${requestedY}px -> ${scrollState.actualY}px (${state.activeTransition?.id || state.activeSection?.id || 'none'}:${state.activeTransition?.phase || 'none'})`);
  }

  await page.close();
  await context.close();
  return samples;
}

function findRelatedReceiver(sample, row) {
  const ids = row.transitionIds || [];
  const receivers = sample.receivers || [];
  return receivers.find((receiver) => {
    const source = receiver.source || receiver.handoffSource || '';
    const selector = receiver.selector || '';
    return ids.some((id) => source.includes(id) || selector.includes(id));
  }) || null;
}

function buildCrosswalkEvidence(samples) {
  const desktopSamples = samples.filter((sample) => sample.viewport.width === 1440 && sample.viewport.height === 840);
  return CROSSWALK.map((row) => {
    const evidence = desktopSamples
      .filter((sample) => row.checkpoints.includes(sample.requestedY))
      .map((sample) => {
        const relatedReceiver = findRelatedReceiver(sample, row);
        return {
          requestedY: sample.requestedY,
          actualY: sample.actualY,
          captureMode: sample.captureMode,
          sequenceId: sample.sequenceId,
          sequenceIndex: sample.sequenceIndex,
          fromRequestedY: sample.fromRequestedY,
          phase: sample.activeTransition?.phase || 'none',
          bridgeType: sample.activeTransition?.bridgeType || 'none',
          copyId: sample.copy?.id || 'none',
          copyOpacity: sample.copy?.primary?.opacity ?? null,
          copyBlurPx: sample.copy?.primary?.blurPx ?? null,
          copySafeMargin: sample.copy?.primary?.safeMargin ?? null,
          receiverOpacity: relatedReceiver?.handoffProgress ?? sample.transitionContext?.receiverOpacity ?? null,
          sceneProgress: sample.activeTransition?.progress ?? null,
          overlapRatio: sample.overlap?.overlapRatio ?? null,
          boundaryLineCount: sample.boundaries?.lineCount ?? null,
          footerVisibleRatio: sample.endpoint?.footerVisibleRatio ?? null,
          transitionContext: sample.transitionContext,
          inkSurfaces: sample.inkSurfaces,
          splitBridges: sample.splitBridges,
          nav: sample.nav,
          copyMetrics: sample.copyMetrics,
          layoutMetrics: sample.layoutMetrics,
          endpoint: sample.endpoint,
          screenshot: sample.artifact?.screenshot || ''
        };
      });

    return {
      ...row,
      status: evidence.length ? 'captured' : 'missing-sample',
      evidence
    };
  });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const outputName = options.outputName || `homepage-checkpoints-${timestampName()}`;
  const outputDir = path.join(outputRoot, outputName);
  await mkdir(outputDir, { recursive: true });

  const server = options.url
    ? { url: options.url, close: async () => {} }
    : await startStaticServer();
  const baseUrl = server.url;
  const consoleMessages = [];
  const browser = await chromium.launch({ headless: !options.headed });

  try {
    const viewportConfigs = options.noMobile ? VIEWPORTS.slice(0, 1) : VIEWPORTS;
    const samples = [];
    for (const viewportConfig of viewportConfigs) {
      if (options.mode === 'fresh' || options.mode === 'all') {
        samples.push(...await captureViewportFresh({
          browser,
          baseUrl,
          outputDir,
          viewportConfig,
          consoleMessages
        }));
      }
      if (options.mode === 'forward' || options.mode === 'all') {
        samples.push(...await captureViewportSequence({
          browser,
          baseUrl,
          outputDir,
          viewportConfig,
          consoleMessages,
          direction: 'forward'
        }));
      }
      if (options.mode === 'reverse' || options.mode === 'all') {
        samples.push(...await captureViewportSequence({
          browser,
          baseUrl,
          outputDir,
          viewportConfig,
          consoleMessages,
          direction: 'reverse'
        }));
      }
      if (options.mode === 'direct-jump' || options.mode === 'all') {
        samples.push(...await captureViewportDirectJump({
          browser,
          baseUrl,
          outputDir,
          viewportConfig,
          consoleMessages
        }));
      }
    }

    const jsonPath = path.join(outputDir, 'homepage-checkpoints.json');
    for (const sample of samples) {
      sample.artifact.jsonPath = jsonPath;
    }
    const result = {
      createdAt: new Date().toISOString(),
      url: withCalibrationParam(baseUrl),
      outputDir,
      phaseGate: 'Phase 0 baseline + pilot measurement harness',
      captureMode: options.mode,
      checkpoints: {
        desktop: DESKTOP_CHECKPOINTS,
        mobileSmoke: options.noMobile ? [] : MOBILE_SMOKE_CHECKPOINTS
      },
      consoleMessages,
      samples,
      crosswalkEvidence: buildCrosswalkEvidence(samples)
    };
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${jsonPath}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
