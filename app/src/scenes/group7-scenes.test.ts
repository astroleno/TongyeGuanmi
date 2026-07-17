import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../story/manifest';
import { CONTACT_COPY, contactScene, renderContactProgress } from './contact';
import { craneAnimationScene, renderCraneAnimationProgress } from './crane-animation';

const stylesheet = [
  readFileSync(new URL('../styles.css', import.meta.url), 'utf8'),
  readFileSync(new URL('../production/editorial-layout.css', import.meta.url), 'utf8')
].join('\n');

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();
  ownerDocument = { defaultView: { innerHeight: 720 } };

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

describe('R4 group7 scenes', () => {
  it('keeps scene renderers idempotent across 0 to 1 to 0 to 1', () => {
    expectIdempotent(renderCraneAnimationProgress, 'data-crane-progress');
    expectIdempotent(renderContactProgress, 'data-contact-progress');
  });

  it('ports contact copy from the R-1 baseline verbatim', () => {
    const contact = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'contact');

    expect(contactScene.staticFallback?.text).toEqual(CONTACT_COPY);
    expect(contact?.normalizedText).toEqual([...CONTACT_COPY]);
    expect(stylesheet).toMatch(
      /\.r4-contact p\s*\{[^}]*color:\s*var\(--ink-body\)[^}]*font-size:\s*var\(--type-body-large-size\)/s
    );
    expect(stylesheet).toMatch(
      /\.r4-contact \.site-footer\s*\{[^}]*color:\s*var\(--ink-muted\)/s
    );
    expect(stylesheet).not.toMatch(/\.r4-contact \.site-footer\s*\{[^}]*font-size:\s*10px/s);
  });

  it('uses native alpha with the figure between the back cloud and foreground landscape', () => {
    const markup = renderToStaticMarkup(createElement(craneAnimationScene.Component, {
      scene: 'crane-animation',
      hidden: false
    }));

    expect(markup).not.toContain('crane-progress');
    expect(stylesheet).toMatch(/\.r4-crane-animation \.crane-figure-video\s*\{[^}]*mix-blend-mode:\s*normal;[^}]*filter:\s*none;/s);
    expect(stylesheet).toMatch(/\.crane-video-transition--figure\s*\{[^}]*z-index:\s*2;/s);
    expect(stylesheet).toMatch(/\.crane-layer--cloud-back\s*\{[^}]*z-index:\s*1;/s);
    expect(stylesheet).toMatch(/\.crane-layer--arch\s*\{[^}]*z-index:\s*3;/s);
    expect(stylesheet).toMatch(/\.crane-layer--cloud-front\s*\{[^}]*z-index:\s*4;/s);
    expect(stylesheet).toMatch(/\.crane-layer--cloud-front-second\s*\{[^}]*z-index:\s*5;/s);
    expect(stylesheet).toMatch(/\.crane-video-transition--front\s*\{[^}]*z-index:\s*8;/s);
  });
});
