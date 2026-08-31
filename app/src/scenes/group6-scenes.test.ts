import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureCopySection } from '../story/copy-baseline';
import { EDUCATION_COPY, educationScene, renderEducationProgress } from './education';
import { renderPhAnimationProgress } from './ph-animation';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

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

describe('R4 group6 scenes', () => {
  it('keeps scene renderers idempotent across 0 to 1 to 0 to 1', () => {
    expectIdempotent(renderPhAnimationProgress, 'data-ph-progress');
    expectIdempotent(renderEducationProgress, 'data-education-progress');
  });

  it('keeps education copy while omitting its retired sectional prefix', () => {
    const education = fixtureCopySection('education');
    const prefix = 'Education / 04';

    expect(educationScene.staticFallback?.text).toEqual(EDUCATION_COPY);
    expect(EDUCATION_COPY).toEqual(education?.normalizedText.filter((item) => item !== prefix));
    expect(EDUCATION_COPY).not.toContain(prefix);

    const markup = renderToStaticMarkup(createElement(educationScene.Component, {
      scene: 'education',
      hidden: false,
      role: 'current'
    }));

    expect(markup).not.toContain(prefix);
    expect(markup).toContain('给企业家的延伸服务');
    expect(stylesheet).toMatch(
      /\.r4-education__row em\s*\{[^}]*color:\s*var\(--ink-body\)[^}]*font-size:\s*var\(--type-body-size\)/s
    );
  });

  it('does not rewrite terminal PH media time on repeated endpoint renders', () => {
    class CountingVideo {
      private time = 0;
      currentTimeWrites = 0;
      duration = 76 / 30;
      readonly dataset: Record<string, string> = {};
      loop = false;
      muted = false;
      paused = true;
      playsInline = false;

      get currentTime(): number { return this.time; }
      set currentTime(value: number) {
        this.time = value;
        this.currentTimeWrites += 1;
      }
      pause(): void { this.paused = true; }
      addEventListener(): void {}
      removeEventListener(): void {}
    }
    const video = new CountingVideo();
    const root = {
      attributes: new Map<string, string>(),
      dataset: {} as Record<string, string>,
      style: new FakeStyle(),
      matches: () => true,
      querySelector: () => video,
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
        if (name.startsWith('data-')) {
          const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
          this.dataset[key] = value;
        }
      }
    };

    const mediaRun = { runId: 'ph-scenes:1', direction: 1 as const };
    renderPhAnimationProgress(root as unknown as HTMLElement, 1, { mediaRun });
    const writes = video.currentTimeWrites;
    renderPhAnimationProgress(root as unknown as HTMLElement, 1, { mediaRun });
    renderPhAnimationProgress(root as unknown as HTMLElement, 1, { mediaRun });

    expect(video.currentTimeWrites).toBe(writes);
  });
});
