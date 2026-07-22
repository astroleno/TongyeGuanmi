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
const brandStyles = readFileSync(
  new URL('../../scenes/brand/phone/PhoneBrand.css', import.meta.url),
  'utf8'
);
const brandFigure3Transition = readFileSync(
  new URL('../../transitions/brand-figure3/phone.ts', import.meta.url),
  'utf8'
);
const figure3Styles = readFileSync(
  new URL('../../scenes/figure3-animation/phone/PhoneFigure3.css', import.meta.url),
  'utf8'
);
const figure3PaperCompositor = readFileSync(
  new URL(
    '../../scenes/figure3-animation/phone/paper-compositor.ts',
    import.meta.url
  ),
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
const ttgLabTransition = readFileSync(
  new URL('../../transitions/ttg-lab/phone.ts', import.meta.url),
  'utf8'
);
const labStyles = readFileSync(
  new URL('../../scenes/lab/phone/PhoneLab.css', import.meta.url),
  'utf8'
);

describe('Phone Brand → Lab visual contracts', () => {
  it('mounts one Services scene at the same boundary as Figure3', () => {
    expect(storySource.match(/<Services\b/g)).toHaveLength(1);
    expect(storyStyles).toMatch(
      /phone-brand-lab__visual-track[^}]+margin-block-end:\s*calc\(-1 \* var\(--portrait-stage-height\)\)/s
    );
    expect(servicesStyles).not.toContain('phone-figure3-services-bridge');
    expect(storySource).not.toContain('window.scrollTo({ top: targetY');
  });

  it('composites Figure3 into paper below one desktop treatment layer', () => {
    expect(figure3Styles).toContain('--phone-figure3-paper: #ede4d2');
    expect(figure3Styles).toMatch(
      /\.phone-figure3::after[^}]+z-index:\s*3/s
    );
    expect(figure3Styles).toContain(
      'data-phone-figure3-paper-compositor="ready"'
    );
    expect(figure3Styles).not.toContain('mix-blend-mode: multiply');
    expect(figure3Styles).not.toContain(
      'data-phone-group45-frame-ready="true"'
    );
    expect(figure3PaperCompositor).toContain(
      "context.globalCompositeOperation = 'multiply'"
    );
    expect(figure3PaperCompositor).toContain(
      "PHONE_FIGURE3_PAPER_COLOR = '#ede4d2'"
    );
    expect(figure3Styles).toMatch(
      /figure3-transition__stage[^}]+background:\s*var\(--phone-figure3-paper\)/s
    );
  });

  it('keeps the Brand → Figure3 document paper flat beneath the authored scene', () => {
    expect(brandStyles).toMatch(
      /\.phone-brand\s*\{[^}]+background:\s*#ede4d2/s
    );
    expect(brandStyles).not.toContain('radial-gradient');
    expect(storyStyles).toMatch(
      /phone-brand-lab__visual-track--figure3\s*\{[^}]+background:\s*#ede4d2/s
    );
  });

  it('uses one complementary ink boundary from Brand into Figure3', () => {
    expect(brandFigure3Transition).toContain('createPhoneInkTransition');
    expect(brandFigure3Transition).toContain("direction: 'bottom-to-top'");
    expect(brandFigure3Transition).toContain("seed: 'brand-figure3'");
    expect(brandFigure3Transition).toContain("from,\n      to,");
    expect(brandFigure3Transition).not.toContain("strategy: 'endpoint-dissolve'");
  });

  it('owns reverse entry through native touch and boundary pre-lock paths', () => {
    expect(storySource).toContain("addEventListener('touchstart', onReverseTouchStart");
    expect(storySource).toContain("addEventListener('touchmove', onReverseTouchMove");
    expect(storySource).toContain('phoneGroup45HasReverseGestureIntent');
    expect(storySource).toContain('scrollY <= documentTop + 32');
  });

  it('lets the ink contour own the only dark Services → TTG edge', () => {
    expect(storyStyles).toMatch(
      /phone-brand-lab__visual-track--ttg[^}]+background:\s*#ede4d2/s
    );
  });

  it('keeps desktop TTG scale while applying the reviewed portrait crop', () => {
    expect(ttgStyles).toContain('--ttg-front-width: var(--ttg-scene-width)');
    expect(ttgStyles).toContain(
      'calc(var(--portrait-stage-height, 100lvh) * 1.44)'
    );
    expect(ttgStyles).toMatch(
      /\.phone-ttg \.ttg-layer--middle\s*\{[^}]+left:\s*175%/s
    );
  });

  it('keeps TTG fully presented while the single Lab root owns the dissolve', () => {
    expect(ttgLabTransition).toContain("strategy: 'desktop-overlay-dissolve'");
    expect(ttgLabTransition).toContain('fromOpacity: 1');
    expect(ttgLabTransition).toContain(
      'lab-receiver-over-retained-ttg-source'
    );
  });

  it('uses one continuous Lab paper across both document screens', () => {
    expect(labStyles).toMatch(
      /\.phone-lab\s*\{[^}]+background:\s*#ede4d2/s
    );
    expect(labStyles).not.toContain('radial-gradient');
    expect(storySource).toContain(
      "lab: { surface: '#ede4d2', themeColor: '#ede4d2' }"
    );
    expect(labStyles.match(/background:\s*transparent/g)).toHaveLength(2);
    expect(labStyles).not.toContain('linear-gradient(180deg, #eee7d8');
    expect(labStyles).not.toContain('phone-ttg-lab-bridge');
  });
});
