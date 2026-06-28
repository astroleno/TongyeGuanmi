#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(rootDir, 'output/playwright');
const DEFAULT_PORT = 8142;
const DEFAULT_HOST = '127.0.0.1';
const CHECKED_TRANSITIONS = [
  'belief-method',
  'method-tooling__method-proof',
  'brand-services',
  'services-lab',
  'lab-education',
  'philosophy-contact'
];

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2']
]);

function parseArgs(argv) {
  const options = {
    url: '',
    outputName: '',
    headed: false
  };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) options.url = arg.slice('--url='.length);
    else if (arg.startsWith('--output-name=')) options.outputName = arg.slice('--output-name='.length);
    else if (arg === '--headed') options.headed = true;
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
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Length': fileStat.size,
          'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
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

async function collectVisibleTransitions(page) {
  return page.evaluate(() => {
    const visibleRatio = (element) => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > 0 ? (width * height) / area : 0;
    };

    return [...document.querySelectorAll('.chapter-transition[data-transition-id], .scene-transition[data-transition-id]')]
      .map((element) => ({
        id: element.dataset.transitionId || '',
        phase: element.dataset.transitionPhase || 'none',
        bridgeType: element.dataset.transitionBridgeType || 'none',
        progress: Number.parseFloat(element.dataset.transitionProgress || '0') || 0,
        visibleRatio: visibleRatio(element)
      }))
      .filter((item) => item.id && (item.visibleRatio > 0.01 || item.progress > 0.01));
  });
}

async function runWheelPath(page, direction) {
  const seen = new Set();
  const samples = [];
  const deltaY = direction === 'forward' ? 420 : -420;
  const maxSteps = 120;

  if (direction === 'reverse') {
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' }));
    await page.waitForTimeout(500);
  } else {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    await page.waitForTimeout(300);
  }

  for (let step = 0; step < maxSteps; step += 1) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(90);
    const transitions = await collectVisibleTransitions(page);
    const scrollY = await page.evaluate(() => Math.round(window.scrollY || window.pageYOffset || 0));
    for (const transition of transitions) {
      if (CHECKED_TRANSITIONS.includes(transition.id)) seen.add(transition.id);
    }
    samples.push({ step, scrollY, transitions });
    if (CHECKED_TRANSITIONS.every((id) => seen.has(id))) break;
  }

  return {
    path: `${direction}-wheel`,
    seenTransitions: [...seen],
    samples
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const outputName = options.outputName || `homepage-transition-wheel-smoke-${timestampName()}`;
  const outputDir = path.join(outputRoot, outputName);
  await mkdir(outputDir, { recursive: true });

  const server = options.url
    ? { url: options.url, close: async () => {} }
    : await startStaticServer();
  const browser = await chromium.launch({ headless: !options.headed });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 840 },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference'
    });
    await page.goto(withCalibrationParam(server.url), { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: 'html, body, * { scroll-behavior: auto !important; }' });
    await waitForPageReady(page);

    const forward = await runWheelPath(page, 'forward');
    const reverse = await runWheelPath(page, 'reverse');
    const failures = [];

    for (const pathResult of [forward, reverse]) {
      for (const transitionId of CHECKED_TRANSITIONS) {
        if (!pathResult.seenTransitions.includes(transitionId)) {
          failures.push(`${pathResult.path} did not observe ${transitionId}.`);
        }
      }
    }

    const output = {
      createdAt: new Date().toISOString(),
      url: withCalibrationParam(server.url),
      wheelSmoke: {
        status: failures.length ? 'failed' : 'passed',
        paths: ['forward-wheel', 'reverse-wheel'],
        checkedTransitions: CHECKED_TRANSITIONS,
        failures
      },
      pathResults: [forward, reverse]
    };

    const jsonPath = path.join(outputDir, 'homepage-wheel-smoke.json');
    await writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${jsonPath}`);
    console.log(`Wheel smoke: ${output.wheelSmoke.status}`);
    if (failures.length) {
      for (const failure of failures) console.log(`- ${failure}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
