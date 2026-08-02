import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

type PrebootInput = Readonly<{
  width: number;
  height: number;
  pathname?: string;
  hash?: string;
  pointerCoarse?: boolean;
  hoverNone?: boolean;
  navigationType?: 'navigate' | 'reload';
}>;

function runPhonePreboot({
  width,
  height,
  pathname = '/',
  hash = '',
  pointerCoarse = true,
  hoverNone = true,
  navigationType = 'navigate'
}: PrebootInput) {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('phone preboot script was not found');

  const dataset: Record<string, string> = {};
  const styles = new Map<string, string>();
  runInNewContext(script, {
    Math,
    document: {
      documentElement: {
        dataset,
        style: {
          setProperty(name: string, value: string) {
            styles.set(name, value);
          }
        }
      }
    },
    location: { pathname, hash },
    performance: {
      getEntriesByType: () => [{ type: navigationType }]
    },
    window: {
      innerHeight: height,
      innerWidth: width,
      visualViewport: { height, width },
      matchMedia(query: string) {
        return {
          matches: query === '(pointer: coarse)'
            ? pointerCoarse
            : query === '(hover: none)' && hoverNone
        };
      }
    }
  });

  return { dataset, styles };
}

describe('phone preboot ownership', () => {
  it('publishes only a presentation-pending cover for supported portrait and landscape phones', () => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 }
    ]) {
      const result = runPhonePreboot(viewport);
      expect(result.dataset).toEqual({ phonePreboot: 'pending' });
      expect(result.styles.get('--phone-preboot-surface')).toBe('#07110e');
    }
  });

  it('keeps direct hashes and reloads covered without restoring scene or Loader state', () => {
    const direct = runPhonePreboot({
      width: 390,
      height: 844,
      hash: '#contact'
    });
    const reload = runPhonePreboot({
      width: 390,
      height: 844,
      navigationType: 'reload'
    });

    expect(direct.dataset).toEqual({ phonePreboot: 'pending' });
    expect(reload.dataset).toEqual({ phonePreboot: 'pending' });
  });

  it('treats /brand-lab as an explicit phone-shell route on a desktop QA workstation', () => {
    const result = runPhonePreboot({
      width: 1440,
      height: 900,
      pathname: '/brand-lab',
      pointerCoarse: false,
      hoverNone: false
    });

    expect(result.dataset).toEqual({ phonePreboot: 'pending' });
    expect(result.styles.get('--phone-preboot-surface')).toBe('#07110e');
  });

  it('does not claim desktop or tablet formal routes', () => {
    expect(runPhonePreboot({
      width: 1440,
      height: 900,
      pointerCoarse: false,
      hoverNone: false
    }).dataset).toEqual({});
    expect(runPhonePreboot({
      width: 768,
      height: 1024
    }).dataset).toEqual({});
  });

  it('contains no validation, checkpoint, scene, or session restoration authority', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

    for (const forbidden of [
      'portrait-spike',
      'portraitEdgeScene',
      'URLSearchParams',
      'validationNumber',
      'sessionStorage',
      'loader-complete',
      'hidden-at'
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });
});
