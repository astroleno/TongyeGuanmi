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
  'figure2-animation',
  'figure2-proof-opening',
  'figure2-proof-cards',
  'figure2-proof-closing',
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

async function positionReadingAtDirectionEdge(page: Page, direction: 1 | -1): Promise<void> {
  await page.evaluate((value) => {
    const current = (window as StoryWindow).__storyApp?.snapshot().current;
    const layer = current
      ? document.querySelector<HTMLElement>(`[data-stage-layer="${current}"]`)
      : null;
    const scrollport = layer?.querySelector<HTMLElement>('[data-reading-scrollport="true"]')
      ?? (layer?.matches('[data-reading="true"]') ? layer : null);
    if (!scrollport) {
      return;
    }
    scrollport.scrollTop = value === 1
      ? Math.max(0, scrollport.scrollHeight - scrollport.clientHeight)
      : 0;
    window.dispatchEvent(new Event('story-reading-entry'));
  }, direction);
}

export async function moveOneHold(page: Page, direction: 1 | -1): Promise<BrowserStorySnapshot> {
  const start = (await storySnapshot(page)).current;
  await positionReadingAtDirectionEdge(page, direction);
  const key = direction === 1 ? 'PageDown' : 'PageUp';
  const reading = await page.evaluate(() => {
    const current = (window as StoryWindow).__storyApp?.snapshot().current;
    return current
      ? document.querySelector<HTMLElement>(`[data-stage-layer="${current}"]`)?.dataset.reading === 'true'
      : false;
  });
  if (reading) {
    await page.keyboard.press(key);
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const before = await storySnapshot(page);
    if (before.current !== start && before.phase === 'hold') {
      return before;
    }
    if (before.phase !== 'hold' && before.phase !== 'staged-paused') {
      await page.waitForFunction((scene) => {
        const snapshot = (window as StoryWindow).__storyApp?.snapshot();
        return snapshot?.phase === 'staged-paused'
          || (snapshot?.phase === 'hold' && snapshot.current !== scene);
      }, start, { timeout: 20_000 });
      continue;
    }
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }

  const final = await storySnapshot(page);
  throw new Error(`Story did not leave ${start}; phase=${final.phase}`);
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
