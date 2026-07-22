import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const storySource = readFileSync(
  new URL('./PhoneBrandLabStory.tsx', import.meta.url),
  'utf8'
);
const storyStyles = readFileSync(
  new URL('./PhoneBrandLabStory.css', import.meta.url),
  'utf8'
);
const figure3Styles = readFileSync(
  new URL('../../scenes/figure3-animation/phone/PhoneFigure3.css', import.meta.url),
  'utf8'
);
const servicesStyles = readFileSync(
  new URL('../../scenes/services/phone/PhoneServices.css', import.meta.url),
  'utf8'
);
const ttgStyles = readFileSync(
  new URL('../../scenes/ttg-animation/phone/PhoneTtg.css', import.meta.url),
  'utf8'
);
const labStyles = readFileSync(
  new URL('../../scenes/lab/phone/PhoneLab.css', import.meta.url),
  'utf8'
);

describe('Phone Brand → Lab visual contracts', () => {
  it('mounts one Services scene and preserves that same layout during handoff', () => {
    expect(storySource.match(/<Services\b/g)).toHaveLength(1);
    expect(servicesStyles).toMatch(
      /\.phone-services[^\n{]+data-phone-figure3-services-bridge="active"/
    );
    expect(servicesStyles).not.toMatch(
      /data-phone-figure3-services-bridge[^}]+phone-services__hero/s
    );
  });

  it('keeps Figure3 paper treatment above the alpha-video compositor', () => {
    expect(figure3Styles).toContain('--phone-figure3-paper: #ede4d2');
    expect(figure3Styles).toMatch(
      /figure3-transition__sticky::after[^}]+z-index:\s*3/s
    );
    expect(figure3Styles).toContain('rgba(220, 220, 208, .54)');
  });

  it('lets the ink contour own the only dark Services → TTG edge', () => {
    expect(storyStyles).toMatch(
      /phone-brand-lab__visual-track--ttg[^}]+background:\s*#ede4d2/s
    );
  });

  it('uses one desktop-proportional camera for every TTG art layer', () => {
    expect(ttgStyles).toContain('--ttg-front-width: var(--ttg-scene-width)');
    expect(ttgStyles).toContain(
      'calc(var(--portrait-stage-height, 100lvh) * 1.44)'
    );
    expect(ttgStyles).not.toContain('.phone-ttg .ttg-layer--middle {');
  });

  it('uses one continuous Lab paper across both document screens', () => {
    expect(labStyles).toMatch(/\.phone-lab\s*\{[^}]+#e9e1ce/s);
    expect(labStyles.match(/background:\s*transparent/g)).toHaveLength(2);
    expect(labStyles).not.toContain('linear-gradient(180deg, #eee7d8');
  });
});
