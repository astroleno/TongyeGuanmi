import { describe, expect, it } from 'vitest';
import { inventoryManifestSeed } from '../story/manifest';
import { BRAND_COPY, brandScene, renderBrandProgress } from './brand';
import { FIGURE2_PROOF_CARDS_COPY, figure2ProofCardsScene, renderProofCardsProgress } from './figure2-proof-cards';
import { FIGURE2_PROOF_CLOSING_COPY, figure2ProofClosingScene, renderProofClosingProgress } from './figure2-proof-closing';
import { FIGURE2_PROOF_OPENING_COPY, figure2ProofOpeningScene, renderProofOpeningProgress } from './figure2-proof-opening';

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

  it('uses the R-1 proof split and brand baseline verbatim', () => {
    const method = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'method');
    const brand = inventoryManifestSeed.copySections.find((section) => section.sectionId === 'brand');

    expect(figure2ProofOpeningScene.staticFallback?.text).toEqual(FIGURE2_PROOF_OPENING_COPY);
    expect(figure2ProofCardsScene.staticFallback?.text).toEqual(FIGURE2_PROOF_CARDS_COPY);
    expect(figure2ProofClosingScene.staticFallback?.text).toEqual(FIGURE2_PROOF_CLOSING_COPY);
    expect(brandScene.staticFallback?.text).toEqual(BRAND_COPY);
    expect(method?.normalizedText.slice(23, 23 + FIGURE2_PROOF_OPENING_COPY.length)).toEqual([...FIGURE2_PROOF_OPENING_COPY]);
    expect(method?.normalizedText.slice(26, 26 + FIGURE2_PROOF_CLOSING_COPY.length)).toEqual([...FIGURE2_PROOF_CLOSING_COPY]);
    expect(method?.normalizedText.slice(27, 27 + FIGURE2_PROOF_CARDS_COPY.length)).toEqual([...FIGURE2_PROOF_CARDS_COPY]);
    expect(brand?.normalizedText).toEqual([...BRAND_COPY]);
  });
});
