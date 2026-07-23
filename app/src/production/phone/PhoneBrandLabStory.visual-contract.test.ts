import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const storySource = readFileSync(
  new URL('./PhoneBrandLabContinuation.tsx', import.meta.url),
  'utf8'
);
const qaShellSource = readFileSync(
  new URL('./PhoneBrandLabStory.tsx', import.meta.url),
  'utf8'
);
const gradeAStorySource = readFileSync(
  new URL('./PhoneGradeAStory.tsx', import.meta.url),
  'utf8'
);
const formalShellSource = readFileSync(
  new URL('./PhoneStoryShell.tsx', import.meta.url),
  'utf8'
);
const edgeSurfaceSource = readFileSync(
  new URL('./phone-edge-surface.ts', import.meta.url),
  'utf8'
);
const edgePublisherSource = readFileSync(
  new URL('./usePhoneEdgeSurface.ts', import.meta.url),
  'utf8'
);
const stageStyles = readFileSync(
  new URL('./PhoneStageRail.css', import.meta.url),
  'utf8'
);
const aodStyles = readFileSync(
  new URL('./scenes/PhoneAod.css', import.meta.url),
  'utf8'
);
const methodStyles = readFileSync(
  new URL('./scenes/PhoneMethodTop.css', import.meta.url),
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
const figure3Scene = readFileSync(
  new URL('../../scenes/figure3-animation/phone/PhoneFigure3.tsx', import.meta.url),
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
  it('embeds continuation without creating a second formal fixed stage', () => {
    expect(storySource).not.toContain('PhoneStageRail');
    expect(storySource).not.toContain('<main');
    expect(storySource).not.toContain('StoryNav');
    expect(qaShellSource.match(/<PhoneStageRail\b/g)).toHaveLength(1);
    expect(formalShellSource.match(/<PhoneStageRail\b/g)).toHaveLength(1);
    expect(gradeAStorySource).toContain('<PhoneBrandLabContinuation');
    expect(gradeAStorySource).toContain('<ProofBrand');
  });

  it('reasserts Safari edge color after browser compositor rebuilds', () => {
    expect(edgePublisherSource).toContain(
      "window.addEventListener('pageshow', republishCurrentSurface)"
    );
    expect(edgePublisherSource).toContain(
      "document.addEventListener('visibilitychange', republishCurrentSurface)"
    );
    expect(edgePublisherSource).toContain(
      "themeColorMeta.setAttribute('content', surface)"
    );
  });

  it('does not let a loaded Grade A root overwrite the active front-stage edge', () => {
    expect(gradeAStorySource).toContain(
      "storyRoot?.dataset.portraitStageActive !== 'true'"
    );
  });

  it('exposes the real Brand receiver only during Proof ink ownership', () => {
    expect(stageStyles).toMatch(
      /data-portrait-checkpoint="proof-to-brand"[^}]+background:\s*transparent/s
    );
  });

  it('shares one treated paper between Method and Figure3', () => {
    expect(aodStyles).toContain('--portrait-reading-paper: #ede4d2');
    expect(methodStyles).toContain(
      'var(--portrait-reading-paper-treatment)'
    );
    expect(figure3Styles).toContain(
      'var(\n      --portrait-reading-paper-treatment'
    );
  });

  it('publishes a stable Lab root and adapter boundary for Unit 6', () => {
    expect(storySource).toContain('labRoot(): HTMLElement | null');
    expect(storySource).toContain(
      'labAdapter(): ScenePresentationAdapterHandle | null'
    );
    expect(storySource).toContain('onLabBoundaryChange');
    expect(storySource).toContain(
      'data-phone-lab-boundary="stable-lab-ph-input"'
    );
  });

  it('mounts one Services scene at the same boundary as Figure3', () => {
    expect(storySource.match(/<Services\b/g)).toHaveLength(1);
    expect(storyStyles).toMatch(
      /phone-brand-lab__visual-track[^}]+margin-block-end:\s*calc\(-1 \* var\(--portrait-stage-height\)\)/s
    );
    expect(servicesStyles).not.toContain('phone-figure3-services-bridge');
    expect(storySource).not.toContain('window.scrollTo({ top: targetY');
  });

  it('composites Figure3 into paper below one desktop treatment layer', () => {
    expect(figure3Styles).toContain(
      '--phone-figure3-paper: var(--portrait-reading-paper, #ede4d2)'
    );
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
    expect(figure3Scene).toContain('data-phone-figure3-endpoint-ready');
    expect(figure3Scene).toContain('prepareTimelineVideoFrame');
    expect(figure3Scene).toContain('phoneFigure3CanStartPreparedRun');
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
    expect(storyStyles).not.toMatch(
      /stage-surfaces\[data-phone-group45-stage-scene="ttg-animation"\][^{]*\{[^}]+background:\s*#080d10/s
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
    expect(ttgStyles).toContain('data-phone-ttg-endpoint-ready');
    expect(ttgStyles).not.toContain(
      'ttg-layer--figure[data-phone-group45-frame-ready="true"]'
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
    expect(edgeSurfaceSource).toContain("lab: '#ede4d2'");
    expect(labStyles.match(/background:\s*transparent/g)).toHaveLength(2);
    expect(labStyles).not.toContain('linear-gradient(180deg, #eee7d8');
    expect(labStyles).not.toContain('phone-ttg-lab-bridge');
  });
});
