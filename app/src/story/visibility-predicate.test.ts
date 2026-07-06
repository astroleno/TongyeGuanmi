import { describe, expect, it } from 'vitest';
import { fromSyntheticVisibility, isInteractable, isVisuallyVisible } from './visibility-predicate';

describe('visibility predicate', () => {
  it('treats mounted visible opaque layers as visually visible', () => {
    const state = fromSyntheticVisibility({ mounted: true, opacity: 1 });

    expect(isVisuallyVisible(state)).toBe(true);
  });

  it('treats hidden or transparent layers as invisible', () => {
    expect(isVisuallyVisible(fromSyntheticVisibility({ visibility: 'hidden' }))).toBe(false);
    expect(isVisuallyVisible(fromSyntheticVisibility({ opacity: 0 }))).toBe(false);
    expect(isVisuallyVisible(fromSyntheticVisibility({ display: 'none' }))).toBe(false);
  });

  it('requires non-inert pointer-enabled layers for interactivity', () => {
    expect(isInteractable(fromSyntheticVisibility({ inert: true }))).toBe(false);
    expect(isInteractable(fromSyntheticVisibility({ pointerEvents: 'none' }))).toBe(false);
    expect(isInteractable(fromSyntheticVisibility({ mounted: true, opacity: 1 }))).toBe(true);
  });
});
