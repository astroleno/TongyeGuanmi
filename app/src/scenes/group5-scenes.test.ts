import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../story/manifest';
import { LAB_COPY, labScene, renderLabProgress } from './lab';
import { renderTtgAnimationProgress } from './ttg-animation';

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelector(): null {
    return null;
  }

  matches(): boolean {
    return true;
  }
}

function expectIdempotent(render: (root: HTMLElement, progress: number) => unknown, attr: string) {
  const root = new FakeElement();
  const start = render(root as unknown as HTMLElement, 0);
  const end = render(root as unknown as HTMLElement, 1);
  const restored = render(root as unknown as HTMLElement, 0);
  const replayed = render(root as unknown as HTMLElement, 1);

  expect(restored).toEqual(start);
  expect(replayed).toEqual(end);
  expect(root.attributes.get(attr)).toBe('1.0000');
}

describe('R4 group5 scenes', () => {
  it('keeps scene renderers idempotent across 0 to 1 to 0 to 1', () => {
    expectIdempotent(renderTtgAnimationProgress, 'data-ttg-progress');
    expectIdempotent(renderLabProgress, 'data-lab-progress');
  });

  it('keeps lab copy while omitting its retired sectional prefix', () => {
    const lab = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'lab');
    const prefix = 'Scenario / 03';

    expect(labScene.staticFallback?.text).toEqual(LAB_COPY);
    expect(LAB_COPY).toEqual(lab?.normalizedText.filter((item) => item !== prefix));
    expect(LAB_COPY).not.toContain(prefix);

    const markup = renderToStaticMarkup(createElement(labScene.Component, {
      scene: 'lab',
      hidden: false,
      role: 'current'
    }));

    expect(markup).not.toContain(prefix);
    expect(markup).toContain('落到现场');
    expect(markup).toContain('class="r4-authored-phrase">店怎么卖</span>');
    expect(markup.replace(/<[^>]+>/g, '')).toContain(`${LAB_COPY[0]} ${LAB_COPY[1]}${LAB_COPY[2]}`);
  });

  it('keeps TTG presentation renders free of surface preparation and parking', () => {
    class CountingVideo {
      private time = 0;
      currentTimeWrites = 0;
      readonly dataset: Record<string, string> = {};
      duration = 2.5;
      loop = false;
      muted = false;
      paused = true;
      playsInline = false;
      playbackRate = 1;
      preload = 'auto';
      loadCalls = 0;
      private readonly classes = new Set<string>();
      classList = {
        add: (...tokens: string[]) => tokens.forEach((token) => this.classes.add(token)),
        remove: (...tokens: string[]) => tokens.forEach((token) => this.classes.delete(token)),
        contains: (token: string) => this.classes.has(token)
      };

      get currentTime(): number { return this.time; }
      set currentTime(value: number) {
        this.time = value;
        this.currentTimeWrites += 1;
      }
      pause(): void { this.paused = true; }
      play(): Promise<void> { this.paused = false; return Promise.resolve(); }
      load(): void { this.loadCalls += 1; }
      addEventListener(): void {}
      removeEventListener(): void {}
    }
    const forward = new CountingVideo();
    const reverse = new CountingVideo();
    forward.classList.add('is-active');
    const root = {
      attributes: new Map<string, string>(),
      dataset: {} as Record<string, string>,
      style: new FakeStyle(),
      matches: () => true,
      querySelector: (selector: string) => selector.includes('reverse') ? reverse : forward,
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
        if (name.startsWith('data-')) {
          const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
          this.dataset[key] = value;
        }
      }
    };

    const mediaRun = { runId: 'ttg-scenes:1', direction: 1 as const };
    renderTtgAnimationProgress(root as unknown as HTMLElement, 1, { mediaRun });
    const writes = [forward.currentTimeWrites, reverse.currentTimeWrites];
    renderTtgAnimationProgress(root as unknown as HTMLElement, 1, { mediaRun });
    renderTtgAnimationProgress(root as unknown as HTMLElement, 1, { mediaRun });

    expect([forward.currentTimeWrites, reverse.currentTimeWrites]).toEqual(writes);
    expect(forward.currentTimeWrites).toBe(0);
    expect(reverse.currentTimeWrites).toBe(0);
    expect(forward.preload).toBe('auto');
    expect(reverse.preload).toBe('auto');
    expect(forward.loadCalls).toBe(0);
    expect(reverse.loadCalls).toBe(0);
  });
});
