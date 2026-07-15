import { describe, expect, it } from 'vitest';
import { positionCurrentProofHistoryAlias } from './proof-alias-navigation';

function proofScrollport(): HTMLElement {
  const dataset: Record<string, string> = {};
  return {
    clientHeight: 800,
    dataset,
    scrollHeight: 2400,
    scrollTop: 500,
    matches: (selector: string) => selector === '[data-reading-scrollport="true"]',
    querySelector: (selector: string) => selector === '[data-r4-proof-panel="cards"]'
      ? { offsetTop: 800 }
      : null
  } as unknown as HTMLElement;
}

describe('Proof history aliases', () => {
  it('repositions opening, cards, and closing aliases within the existing Proof hold', () => {
    const layer = proofScrollport();

    expect(positionCurrentProofHistoryAlias(layer, 'figure2-proof', '#figure2-proof-opening'))
      .toEqual({ panel: 'opening', edge: 'top' });
    expect(layer.scrollTop).toBe(0);
    expect(layer.dataset.readingEdge).toBe('top');

    expect(positionCurrentProofHistoryAlias(layer, 'figure2-proof', '#figure2-proof-cards'))
      .toEqual({ panel: 'cards' });
    expect(layer.scrollTop).toBe(800);
    expect(layer.dataset.readingEdge).toBeUndefined();

    expect(positionCurrentProofHistoryAlias(layer, 'figure2-proof', '#figure2-proof-closing'))
      .toEqual({ panel: 'closing', edge: 'bottom' });
    expect(layer.scrollTop).toBe(1600);
    expect(layer.dataset.readingEdge).toBe('bottom');
  });
});
