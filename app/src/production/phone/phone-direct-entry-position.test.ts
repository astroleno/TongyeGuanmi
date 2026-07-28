import { describe, expect, it } from 'vitest';
import {
  phoneDirectEntryGeometryReady,
  resolvePhoneDirectEntryOffset
} from './phone-direct-entry-position';

describe('phone direct-entry landing resolver', () => {
  it('derives a stable document offset without scheduling or commanding scroll', () => {
    expect(resolvePhoneDirectEntryOffset({
      rectTop: 120,
      targetHeight: 300,
      viewportHeight: 100
    })).toBe(120);
  });

  it('keeps proof-panel positioning as pure geometry for the shared transaction', () => {
    expect(resolvePhoneDirectEntryOffset({
      rectTop: 120,
      targetHeight: 700,
      viewportHeight: 300,
      proofPanelIndex: 2
    })).toBe(520);
  });

  it('does not invent a negative landing when the document target is above the viewport', () => {
    expect(resolvePhoneDirectEntryOffset({
      rectTop: -80,
      targetHeight: 100,
      viewportHeight: 500,
      proofPanelIndex: 1
    })).toBe(0);
  });

  it('accepts a direct-entry landing only after local and upstream geometry settle', () => {
    expect(phoneDirectEntryGeometryReady([true, true])).toBe(true);
    expect(phoneDirectEntryGeometryReady([false, true])).toBe(false);
    expect(phoneDirectEntryGeometryReady([true, false])).toBe(false);
  });
});
