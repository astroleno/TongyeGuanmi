import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const editorialStylesheet = readFileSync(new URL('./editorial-layout.css', import.meta.url), 'utf8');
const navigationStylesheet = readFileSync(new URL('./StoryNav.css', import.meta.url), 'utf8');

const compactQuery = '@media (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)';
const compactStart = editorialStylesheet.indexOf(compactQuery);
const compactStyles = editorialStylesheet.slice(compactStart);

describe('production typography contract', () => {
  it('defines one semantic type, weight, and warm-paper ink system', () => {
    for (const declaration of [
      '--ink-primary: rgba(37, 39, 25, .94)',
      '--ink-body: rgba(37, 39, 25, .72)',
      '--ink-muted: rgba(37, 39, 25, .66)',
      '--ink-accent: #786329',
      '--type-display-finale-size: clamp(36px, 4.4vw, 78px)',
      '--type-display-lead-size: clamp(38px, 4.4vw, 78px)',
      '--type-display-wide-size: clamp(32px, 3.8vw, 68px)',
      '--type-row-title-size: clamp(21px, 1.9vw, 34px)',
      '--type-body-large-size: clamp(17px, 1.15vw, 18px)',
      '--type-body-size: clamp(16px, 1vw, 17px)',
      '--type-helper-size: clamp(13px, .9vw, 14px)',
      '--type-label-size: 12px',
      '--type-navigation-size: 12px',
      '--type-footer-size: 12px',
      '--font-weight-body: 400',
      '--font-weight-display: 600',
      '--font-weight-strong: 700'
    ]) {
      expect(stylesheet).toContain(declaration);
    }

    expect(stylesheet).not.toMatch(/--r4-part-(?:label|wide-title|lead-title|row-title|body|finale)-size/);
    expect(`${stylesheet}\n${navigationStylesheet}`).not.toMatch(/font-weight:\s*(?:720|760)/);
  });

  it('assigns equivalent scene roles to the shared tokens', () => {
    expect(stylesheet).toMatch(/\.r4-method__row p,[\s\S]*?font-size:\s*var\(--type-body-size\)/);
    expect(stylesheet).toMatch(/\.r4-services__capability-lead > p\s*\{[^}]*font-size:\s*var\(--type-body-large-size\)/s);
    expect(stylesheet).toMatch(/\.r4-brand__definition p\s*\{[^}]*color:\s*var\(--ink-body\)[^}]*font-size:\s*var\(--type-body-large-size\)/s);
    expect(stylesheet).toMatch(/\.r4-proof-cards__row p\s*\{[^}]*color:\s*var\(--ink-body\)[^}]*font-size:\s*var\(--type-body-size\)/s);
    expect(stylesheet).toMatch(/\.site-footer\s*\{[^}]*font-size:\s*var\(--type-footer-size\)/s);
    expect(navigationStylesheet).not.toMatch(/font-size:\s*11px/);
    expect(navigationStylesheet.match(/font-size:\s*var\(--type-navigation-size\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps compact phone landscape within the approved minimums and two-column row contract', () => {
    expect(compactStart).toBeGreaterThanOrEqual(0);
    expect(compactStyles).toContain('--type-body-large-size: 16px');
    expect(compactStyles).toContain('--type-body-size: 15px');
    expect(compactStyles).toContain('--type-helper-size: 13px');
    expect(compactStyles).toMatch(/\.r4-method__row,[\s\S]*?\.r4-education__row\s*\{[^}]*grid-template-columns:\s*38px minmax\(0, 1fr\)/s);
    expect(compactStyles).toMatch(/\.r4-method__row p,[\s\S]*?\.r4-education__row em\s*\{[^}]*grid-column:\s*2[^}]*min-width:\s*280px/s);
    expect(compactStyles).toMatch(/\.r4-brand__grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(compactStyles).toMatch(/\.r4-proof-page \.r4-proof-cards__row\s*\{[^}]*padding-block:\s*8px/s);
  });

  it('keeps the font strategy local and preserves the single approved title asset', () => {
    expect(stylesheet.match(/@font-face/g)).toHaveLength(1);
    expect(stylesheet).toContain('qiji-title-subset.ttf');
    expect(stylesheet).not.toMatch(/https?:\/\//);
    expect(stylesheet).not.toMatch(/@import\s+url/);
  });
});
