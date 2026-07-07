import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../story/manifest';
import { EDUCATION_COPY, educationScene, renderEducationProgress } from './education';
import { renderPhAnimationProgress } from './ph-animation';

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

  it('ports education copy from the R-1 baseline verbatim', () => {
    const education = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'education');

    expect(educationScene.staticFallback?.text).toEqual(EDUCATION_COPY);
    expect(education?.normalizedText).toEqual([...EDUCATION_COPY]);
  });
});
