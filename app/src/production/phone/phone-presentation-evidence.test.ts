import { describe, expect, it, vi } from 'vitest';
import {
  readPhoneScenePresentation,
  phoneSurfaceSupportsEvidence
} from './phone-story/presentation';

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

  it('does not let an unmarked AOD reveal surface stand in for a static-poster proof', () => {
    const fallback = {
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
        if (selector.includes('data-aod-static-poster')) return null;
        return selector.includes('data-aod-reveal-surface') ? fallback : null;
      },
      getBoundingClientRect: () => ({
        left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844
      })
    } as unknown as HTMLElement;

    const presentation = readPhoneScenePresentation('aod-animation', root, root);
    expect(presentation[4]).toBeNull();
    expect(phoneSurfaceSupportsEvidence(presentation, 'direct-entry')).toBe(false);
    expect(phoneSurfaceSupportsEvidence(presentation, 'packed-canvas-frame')).toBe(false);
  });

  it('proves the visible Lab body instead of its clipped eyebrow at the stable landing', () => {
    const viewport = {
      left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844
    };
    const eyebrow = {
      isConnected: true,
      hidden: false,
      textContent: '落到现场',
      getBoundingClientRect: () => ({
        left: 24, top: -46, right: 366, bottom: -16, width: 342, height: 30
      })
    } as unknown as HTMLElement;
    const body = {
      isConnected: true,
      hidden: false,
      textContent: '先看账，再定工具。',
      getBoundingClientRect: () => ({
        left: 24, top: 110, right: 366, bottom: 196, width: 342, height: 86
      })
    } as unknown as HTMLElement;
    const title = {
      isConnected: true,
      hidden: false,
      textContent: '先看账，再定工具。',
      getBoundingClientRect: () => ({
        left: 24, top: 0, right: 366, bottom: 86, width: 342, height: 86
      })
    } as unknown as HTMLElement;
    const root = {
      isConnected: true,
      hidden: false,
      dataset: {},
      textContent: '先看账，再定工具。',
      querySelector(selector: string) {
        if (selector === '#phone-lab-title') return title;
        if (selector === '.phone-lab__hero > p') return eyebrow;
        if (selector === '.phone-lab__hero > p:not(.phone-lab__eyebrow)') return body;
        return null;
      },
      getBoundingClientRect: () => viewport
    } as unknown as HTMLElement;

    vi.stubGlobal('window', {
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: { offsetLeft: 0, offsetTop: 0, width: 390, height: 844 }
    });
    try {
      expect(readPhoneScenePresentation('lab', root, root)).toEqual([
        true, true, true, true, null
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
