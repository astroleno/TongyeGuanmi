import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../story/manifest';
import { renderFigure3AnimationProgress } from './figure3-animation';
import { SERVICES_COPY, renderServicesProgress, servicesScene } from './services';

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

describe('R4 group4 scenes', () => {
  it('keeps scene renderers idempotent across 0 to 1 to 0 to 1', () => {
    expectIdempotent(renderFigure3AnimationProgress, 'data-figure3-progress');
    expectIdempotent(renderServicesProgress, 'data-services-progress');
  });

  it('ports services copy from the R-1 baseline verbatim', () => {
    const services = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'services');

    expect(servicesScene.staticFallback?.text).toEqual(SERVICES_COPY);
    expect(services?.normalizedText).toEqual([...SERVICES_COPY]);
  });

  it('keeps Services as a two-panel scene-owned reading composition', () => {
    const markup = renderToStaticMarkup(createElement(servicesScene.Component, {
      scene: 'services',
      hidden: false,
      role: 'current'
    }));

    expect(markup.match(/data-reading-scrollport="true"/g)).toHaveLength(1);
    expect(markup).toContain('class="r4-services__wide"');
    expect(markup).toContain('class="r4-services__signals"');
    expect(markup).toContain('class="r4-services__vertical"');
    expect(markup).toContain('class="r4-services__capability-lead"');
    expect(markup).toContain('企业服务能力');
    expect(markup).toContain('先小做，再扩');
    expect(markup).toContain(SERVICES_COPY[3]);
    expect(markup).not.toContain('01—04');
    expect(markup).toContain('<span>01</span>');
    expect(markup.match(/class="r4-services__row"/g)).toHaveLength(4);
    expect(stylesheet).not.toMatch(
      /\.r4-services__row\s*\{[^}]*min-height:\s*39svh/s
    );
    expect(stylesheet).not.toMatch(
      /\.r4-services__row\s*\{[^}]*border-(?:top|bottom)/s
    );
    expect(stylesheet).toMatch(
      /\.r4-services\s*\{[^}]*background:\s*#ede4d2/s
    );
    expect(stylesheet).not.toMatch(
      /\.r4-services__capability-lead h2\s*\{[^}]*max-width:\s*5em/s
    );
  });
});
