import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const preference = styles.slice(styles.indexOf('@media (prefers-contrast: more)'));
const normal = styles.slice(0, styles.indexOf('@media (prefers-contrast: more)'));
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

function luminance(hex: string) {
  const channels = hex.match(/[a-f0-9]{2}/gi)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}

describe('semantic colors and increased contrast', () => {
  it('preserves the existing normal-mode palette', () => {
    for (const token of ['--r4-warm-paper: #ede4d2', '--surface-night: #07110e',
      '--surface-static: #f4f0e6', '--ink-body: rgba(37, 39, 25, .72)',
      '--ink-inverse-body: rgba(247, 237, 215, .82)']) expect(normal).toContain(token);
    expect(normal).not.toContain('--reading-fg:');
    expect(styles).not.toMatch(/(--[\w-]+):\s*var\(\1\)/);
  });

  it('changes contrast without changing layout, typography, animation or visibility', () => {
    expect(preference).toContain('--reading-fg: var(--ink-primary)');
    expect(preference).not.toMatch(/(?:^|[;{\n])\s*(?:font[\w-]*|width|height|padding[\w-]*|margin[\w-]*|display|visibility|opacity|transform|animation|transition)\s*:/);
    expect(preference).toContain('html .site-nav[data-tone="light"]');
    expect(preference).toContain('background: var(--surface-night)');
    expect(preference).toContain('background: var(--surface-static)');
    expect(preference).toMatch(/\.r4-hero-scene__content p,[^{}]*\{[^}]*color: var\(--ink-inverse-body\)/s);
    expect(preference).toContain('html .portrait-scroll-spike__hero-subtitle { z-index: 3; }');
  });

  it('provides strong contrast for the opaque text/surface pairs', () => {
    for (const [fg, bg] of [['#252719', '#ede4d2'], ['#343627', '#ede4d2'],
      ['#58471d', '#ede4d2'], ['#f7edd7', '#07110e'], ['#06100d', '#f4f0e6']]) {
      const a = luminance(fg!), b = luminance(bg!);
      expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(7);
    }
  });

  it('lets phone reading leaves inherit contrast without changing their default colors', () => {
    expect(read('./scenes/method-top/phone/PhoneMethodTop.css')).toContain('color: var(--reading-fg, rgba(30, 33, 28, .76))');
    expect(read('./scenes/brand/phone/PhoneBrand.css')).toContain('color: var(--reading-fg, #554f40)');
    expect(read('./scenes/services/phone/PhoneServices.css')).toContain('color: var(--reading-fg, #6d6758)');
    expect(read('./scenes/lab/phone/PhoneLab.css')).toContain('color: var(--reading-fg, #514f42)');
  });

  it('keeps debug-only chrome out of the production stylesheet, without losing its breakpoint', () => {
    const debug = read('./harness/chrome.css');
    expect(normal).not.toContain('.harness-hud');
    expect(debug).toContain('.harness-hud');
    expect(debug).toContain('@media (max-width: 820px)');
    expect(read('./harness/HarnessRouter.tsx')).toContain("import './chrome.css'");
    expect(normal).toContain('.stage-harness-shell');
  });
});
