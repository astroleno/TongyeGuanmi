import { describe, expect, it } from 'vitest';
import {
  readPhoneScenePresentation,
  phoneSurfaceSupportsEvidence
} from './phone-presentation-evidence';

describe('phone presentation evidence', () => {
  it('does not treat a connected cinematic wrapper as a presented Figure3 frame', () => {
    const root = {
      isConnected: true,
      hidden: false,
      dataset: {},
      textContent: '',
      querySelector(selector: string) {
        if (selector.includes('data-phone-figure3-paper-canvas')) return null;
        return null;
      },
      getBoundingClientRect: () => ({
        left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844
      })
    } as unknown as HTMLElement;

    expect(readPhoneScenePresentation('figure3-animation', root, root)).toEqual([
      true, true, true, false, null
    ]);
  });

  it('requires the manifest-declared AOD canvas before publishing direct-entry proof', () => {
    const frame = {
      isConnected: true,
      hidden: false,
      dataset: {},
      getBoundingClientRect: () => ({
        left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844
      })
    } as unknown as HTMLElement;
    const root = {
      isConnected: true,
      hidden: false,
      dataset: {},
      textContent: '',
      querySelector(selector: string) {
        return selector.includes('data-aod-figure-canvas') ? frame : null;
      },
      getBoundingClientRect: () => ({
        left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844
      })
    } as unknown as HTMLElement;

    const presentation = readPhoneScenePresentation('aod-animation', root, root);
    expect(presentation[4]).toBe('packed-canvas-frame');
    expect(phoneSurfaceSupportsEvidence(presentation, 'direct-entry')).toBe(true);
  });
});
