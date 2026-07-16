import { expect, type Page } from '@playwright/test';

export type BrowserStorySnapshot = {
  phase: string;
  current: string;
  layerWindow: { prev?: string; current: string; next?: string; retiring: readonly string[] };
  virtualProgress: number;
  visibleLayers: number;
  interactableLayers: number;
  mountedLayers: number;
  canvases: number;
  webglCanvases: number;
  videos: number;
  playingVideos: number;
  loadedScenes: readonly string[];
  loadedTransitions: readonly string[];
  lifecycle: {
    mounted: number;
    disposed: number;
    releasedCanvases: number;
    releasedVideos: number;
  };
  reducedMotion: boolean;
  loaderMode: 'cold-hero' | 'direct' | 'reduced';
  loaderStatus: 'running' | 'exiting' | 'hidden';
  heroIntroMode: 'waiting' | 'running' | 'complete' | 'endpoint';
  presentationReady: boolean;
  recovery?: {
    scope: 'boot' | 'segment';
    status: 'fallback' | 'recovering' | 'failed';
    segment?: string;
    direction?: 1 | -1;
    endpoint?: string;
  };
  lastError?: string;
};

type StoryWindow = Window & {
  __storyApp?: {
    navigate(scene: string, source?: string): Promise<void>;
    snapshot(): BrowserStorySnapshot;
  };
  __story?: {
    getState(): {
      state: unknown;
      eventLog: readonly { event: { type: string; source?: string } }[];
    };
  };
};

export const canonicalScenes = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'method-bottom',
  'figure2-animation',
  'figure2-proof',
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
] as const;

export async function bootStory(page: Page, path = '/'): Promise<BrowserStorySnapshot> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const story = (window as StoryWindow).__storyApp;
    const snapshot = story?.snapshot();
    return snapshot?.phase === 'hold' && snapshot.presentationReady === true;
  }, undefined, { timeout: 30_000 });
  await page.waitForFunction(async () => {
    const story = (window as StoryWindow).__storyApp;
    const first = story?.snapshot();
    if (first?.phase !== 'hold' || first.presentationReady !== true) {
      return false;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const settled = story?.snapshot();
    return settled?.phase === 'hold' && settled.presentationReady === true;
  }, undefined, { timeout: 30_000 });
  return storySnapshot(page);
}

export async function storySnapshot(page: Page): Promise<BrowserStorySnapshot> {
  return page.evaluate(() => {
    const snapshot = (window as StoryWindow).__storyApp?.snapshot();
    if (!snapshot) {
      throw new Error('window.__storyApp is unavailable');
    }
    return snapshot;
  });
}

export async function waitForHold(page: Page, scene: string): Promise<BrowserStorySnapshot> {
  await page.waitForFunction((expected) => {
    const snapshot = (window as StoryWindow).__storyApp?.snapshot();
    if (snapshot?.phase !== 'hold' || snapshot.current !== expected) {
      return false;
    }
    const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${expected}"]`);
    if (layer?.dataset.reading !== 'true') {
      return true;
    }
    const scrollport = layer.querySelector<HTMLElement>('[data-reading-scrollport="true"]')
      ?? (layer.matches('[data-reading-scrollport="true"]') ? layer : null);
    return scrollport?.dataset.readingEdge === 'top'
      || scrollport?.dataset.readingEdge === 'bottom';
  }, scene, { timeout: 30_000 });
  return storySnapshot(page);
}

export async function navigateStory(page: Page, scene: string): Promise<BrowserStorySnapshot> {
  await page.evaluate(async (target) => {
    const api = (window as StoryWindow).__storyApp;
    if (!api) {
      throw new Error('window.__storyApp is unavailable');
    }
    await api.navigate(target, 'menu');
  }, scene);
  return waitForHold(page, scene);
}

export async function reachReadingEdge(page: Page, direction: 1 | -1): Promise<void> {
  const initial = await page.evaluate((value) => {
    const current = (window as StoryWindow).__storyApp?.snapshot().current;
    const layer = current
      ? document.querySelector<HTMLElement>(`[data-stage-layer="${current}"]`)
      : null;
    const scrollport = layer?.querySelector<HTMLElement>('[data-reading-scrollport="true"]')
      ?? (layer?.matches('[data-reading="true"]') ? layer : null);
    if (!scrollport || layer?.dataset.reading !== 'true') {
      return null;
    }
    const maxScrollTop = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight);
    const remaining = value === 1 ? maxScrollTop - scrollport.scrollTop : scrollport.scrollTop;
    const stepPixels = Math.max(120, window.innerHeight * 0.9);
    return {
      scene: current,
      stepPixels,
      maxInputs: Math.ceil(Math.max(0, remaining) / stepPixels) + 4
    };
  }, direction);
  if (!initial) {
    return;
  }

  for (let index = 0; index < initial.maxInputs; index += 1) {
    const state = await page.evaluate(({ scene, direction: value }) => {
      const snapshot = (window as StoryWindow).__storyApp?.snapshot();
      const layer = document.querySelector<HTMLElement>(`[data-stage-layer="${scene}"]`);
      const scrollport = layer?.querySelector<HTMLElement>('[data-reading-scrollport="true"]')
        ?? (layer?.matches('[data-reading="true"]') ? layer : null);
      if (snapshot?.phase !== 'hold' || snapshot.current !== scene || !scrollport) {
        return { left: true, atEdge: false, remaining: 0 };
      }
      const maxScrollTop = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight);
      const remaining = value === 1 ? maxScrollTop - scrollport.scrollTop : scrollport.scrollTop;
      return {
        left: false,
        remaining,
        atEdge: value === 1
          ? scrollport.scrollTop >= maxScrollTop - 1
          : scrollport.scrollTop <= 1
      };
    }, { scene: initial.scene, direction });
    if (state.left || state.atEdge) {
      return;
    }
    const pixels = state.remaining <= initial.stepPixels * 1.25
      ? state.remaining
      : initial.stepPixels;
    await page.evaluate(({ direction: value, pixels: distance }) => {
      const target = document.querySelector<HTMLElement>('.story-app');
      if (!target) throw new Error('story app missing');
      const dispatchTouch = (type: string, clientY: number | undefined) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', {
          value: clientY === undefined ? [] : [{ clientX: 32, clientY }]
        });
        target.dispatchEvent(event);
      };
      const startY = value === 1 ? distance + 32 : 32;
      dispatchTouch('touchstart', startY);
      dispatchTouch('touchmove', startY - value * distance);
      dispatchTouch('touchend', undefined);
    }, { direction, pixels });
  }
  throw new Error(`Reading scene ${initial.scene} did not reach its ${direction === 1 ? 'bottom' : 'top'} edge`);
}

export async function moveOneHold(page: Page, direction: 1 | -1): Promise<BrowserStorySnapshot> {
  const start = (await storySnapshot(page)).current;
  const key = direction === 1 ? 'PageDown' : 'PageUp';
  await reachReadingEdge(page, direction);
  try {
    for (let gesture = 0; gesture < 4; gesture += 1) {
      await page.keyboard.press(key);
      await page.waitForFunction((scene) => {
        const snapshot = (window as StoryWindow).__storyApp?.snapshot();
        return snapshot?.phase === 'staged-paused'
          || (snapshot?.phase === 'hold' && snapshot.current !== scene);
      }, start, { timeout: 30_000 });
      const snapshot = await storySnapshot(page);
      if (snapshot.phase === 'hold' && snapshot.current !== start) {
        return snapshot;
      }
    }
    throw new Error(`Hold ${start} exceeded the staged gesture budget`);
  } catch (error) {
    const debug = await page.evaluate(() => ({
      snapshot: (window as StoryWindow).__storyApp?.snapshot(),
      events: (window as StoryWindow).__story?.getState().eventLog.slice(-16)
        .map(({ event }) => event.type) ?? []
    }));
    throw new Error(`Hold ${start} did not leave after ${key}: ${JSON.stringify(debug)}`, { cause: error });
  }
}

export async function expectLayerInvariants(page: Page): Promise<void> {
  const snapshot = await storySnapshot(page);
  expect(snapshot.visibleLayers).toBeLessThanOrEqual(2);
  expect(snapshot.interactableLayers).toBeLessThanOrEqual(1);
  expect(snapshot.mountedLayers).toBeLessThanOrEqual(4);
  if (snapshot.phase === 'hold') {
    expect(snapshot.visibleLayers).toBe(1);
    expect(snapshot.interactableLayers).toBe(1);
  }
}

export async function eventTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as StoryWindow).__story?.getState().eventLog
    .map(({ event }) => event.type) ?? []);
}
