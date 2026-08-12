import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inventoryManifestSeed } from '../story/manifest';
import { BRAND_COPY, brandScene, renderBrandProgress } from './brand';
import { FIGURE2_PROOF_CARDS_COPY, figure2ProofCardsScene, renderProofCardsProgress } from './figure2-proof-cards';
import { FIGURE2_PROOF_CLOSING_COPY, figure2ProofClosingScene, renderProofClosingProgress } from './figure2-proof-closing';
import { FIGURE2_PROOF_OPENING_COPY, figure2ProofOpeningScene, renderProofOpeningProgress } from './figure2-proof-opening';
import { FIGURE2_PROOF_COPY, figure2ProofScene } from './figure2-proof';

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

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
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

describe('figure2 proof and brand scene renderers', () => {
  it('keeps renderers idempotent across 0 to 1 to 0 to 1', () => {
    expectIdempotent(renderProofOpeningProgress, 'data-proof-opening-progress');
    expectIdempotent(renderProofCardsProgress, 'data-proof-cards-progress');
    expectIdempotent(renderProofClosingProgress, 'data-proof-closing-progress');
    expectIdempotent(renderBrandProgress, 'data-brand-progress');
  });

  it('keeps proof opening copy at its authored position while visibility crosses the depth threshold', () => {
    const root = new FakeElement();

    expect(renderProofOpeningProgress(root as unknown as HTMLElement, 0)).toMatchObject({ opacity: 0, y: 0 });
    expect(renderProofOpeningProgress(root as unknown as HTMLElement, 1)).toMatchObject({ opacity: 1, y: 0 });
    expect(root.style.values.get('--r4-proof-opening-y')).toBe('0.00px');
  });

  it('uses the shared reading-part typography tokens for Proof', () => {
    expect(stylesheet).toContain('--type-display-wide-size: clamp(32px, 3.8vw, 68px)');
    expect(stylesheet).toMatch(
      /\.r4-proof-opening__title\s*\{[^}]*font-size:\s*var\(--type-display-wide-size\)/s
    );
    expect(stylesheet).toMatch(
      /\.r4-proof-cards__row p\s*\{[^}]*color:\s*var\(--ink-body\)[^}]*font-size:\s*var\(--type-body-size\)/s
    );
    expect(stylesheet).not.toContain('method-proof__');
    expect(stylesheet).not.toMatch(
      /\.r4-proof-cards__row\s*\{[^}]*border-(?:top|bottom)/s
    );
  });

  it('uses the R-1 proof split and brand baseline verbatim', () => {
    const method = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'method');
    const brand = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'brand');

    expect(figure2ProofOpeningScene.staticFallback?.text).toEqual(FIGURE2_PROOF_OPENING_COPY);
    expect(figure2ProofCardsScene.staticFallback?.text).toEqual(FIGURE2_PROOF_CARDS_COPY);
    expect(figure2ProofClosingScene.staticFallback?.text).toEqual(FIGURE2_PROOF_CLOSING_COPY);
    expect(figure2ProofScene.staticFallback?.text).toEqual(FIGURE2_PROOF_COPY);
    expect(brandScene.staticFallback?.text).toEqual(BRAND_COPY);
    expect(method?.normalizedText.slice(23, 23 + FIGURE2_PROOF_OPENING_COPY.length)).toEqual([...FIGURE2_PROOF_OPENING_COPY]);
    expect(method?.normalizedText.slice(26, 26 + FIGURE2_PROOF_CLOSING_COPY.length)).toEqual([...FIGURE2_PROOF_CLOSING_COPY]);
    expect(method?.normalizedText.slice(27, 27 + FIGURE2_PROOF_CARDS_COPY.length)).toEqual([...FIGURE2_PROOF_CARDS_COPY]);
    expect(brand?.normalizedText).toEqual([...BRAND_COPY]);
  });

  it('uses one explicit scene-owned scrollport with three 100svh semantic panels and no snap', () => {
    const markup = renderToStaticMarkup(createElement(figure2ProofScene.Component, {
      scene: 'figure2-proof',
      hidden: false
    }));

    expect(figure2ProofScene.id).toBe('figure2-proof');
    expect(markup.match(/data-reading-scrollport="true"/g)).toHaveLength(1);
    expect(stylesheet).toMatch(/\.stage-layer\[data-stage-layer="figure2-proof"\]\[data-reading="true"\]\s*\{[^}]*overflow:\s*hidden/s);
    expect(stylesheet).toMatch(/\.r4-proof-compound\s*\{[^}]*height:\s*100svh[^}]*overflow-y:\s*auto/s);
    expect(stylesheet).toMatch(/\.r4-proof-panel\s*\{[^}]*min-height:\s*100svh/s);
    expect(stylesheet).not.toMatch(/\.r4-proof-(?:compound|panel)\s*\{[^}]*scroll-snap/s);
    expect(stylesheet).toMatch(
      /\.r4-proof-scroll__content--cards\s*\{[^}]*top:\s*50%[^}]*translate3d\(0, calc\(-50% \+ var\(--r4-proof-scroll-y\)\), 0\)/s
    );
    expect(stylesheet).toMatch(
      /@media[\s\S]*?\(orientation: portrait\)[\s\S]*?\.r4-proof-scroll__content--opening,\s*\.r4-proof-scroll__content--cards\s*\{[^}]*top:\s*50%/s
    );
  });

  it('encodes the closing proof sentence as exactly three authored line groups', () => {
    const markup = renderToStaticMarkup(createElement(figure2ProofScene.Component, {
      scene: 'figure2-proof',
      hidden: false
    }));
    const compatibilityMarkup = renderToStaticMarkup(createElement(figure2ProofClosingScene.Component, {
      scene: 'figure2-proof-closing',
      hidden: false
    }));

    for (const rendered of [markup, compatibilityMarkup]) {
      expect(rendered).toContain('r4-proof-closing__line r4-proof-closing__line--lead">同野观幂做第四种：</span>');
      expect(rendered).toContain('r4-proof-closing__line r4-proof-closing__line--method">先进现场，再定章法，</span>');
      expect(rendered).toContain('r4-proof-closing__line r4-proof-closing__line--result">陪你跑到账上有数。</span>');
      expect(rendered.match(/r4-proof-closing__line/g)).toHaveLength(6);
    }
    expect(stylesheet).toMatch(/\.r4-proof-closing__line\s*\{[^}]*display:\s*block/s);
    expect(stylesheet).toMatch(
      /\.r4-proof-closing__line:not\(:first-child\)\s*\{[^}]*white-space:\s*nowrap/s
    );
  });
});
