import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phonePresentationLayerZIndex } from './phone-presentation-layers';

const storySource = readFileSync(
  new URL('./PhoneBrandLabContinuation.tsx', import.meta.url),
  'utf8'
);
const compositeRunnerSource = readFileSync(
  new URL('./phone-composite-runner.ts', import.meta.url),
  'utf8'
);
const continuationBundleSource = readFileSync(
  new URL('./PhoneContinuationBundle.tsx', import.meta.url),
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
const storyRuntimeSource = readFileSync(
  new URL('./phone-story-runtime.ts', import.meta.url),
  'utf8'
);
const storyProjectorSource = readFileSync(
  new URL('./phone-story-projector.ts', import.meta.url),
  'utf8'
);
const stageRuntimeSource = readFileSync(
  new URL('./usePhoneStageRuntime.ts', import.meta.url),
  'utf8'
);
const transitionCoordinatorSource = readFileSync(
  new URL('./phone-transition-coordinator.ts', import.meta.url),
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
    expect(gradeAStorySource).toContain('<PhoneStoryTailBundle');
    expect(gradeAStorySource).toContain('<ProofBrand');
  });

  it('passes direct continuation identity through a positional lazy boundary', () => {
    expect(continuationBundleSource).toContain('plan[0]');
    expect(continuationBundleSource).toContain('plan[1]');
    expect(continuationBundleSource).not.toContain('plan.group');
    expect(continuationBundleSource).not.toContain('plan.scene');
    expect(storyRuntimeSource).not.toContain('phoneRuntimeRunLeg');
    expect(storyRuntimeSource).not.toContain(
      'provideRelease: (lease: PhoneReleaseLease)'
    );
    expect(compositeRunnerSource).not.toContain('resource.session[12]({');
    expect(compositeRunnerSource).not.toContain('const dependenciesFor');
  });

  it('reasserts Safari edge color after browser compositor rebuilds', () => {
    expect(storyRuntimeSource).toContain(
      "addEventListener('pageshow', reapplyCurrentProjection)"
    );
    expect(storyRuntimeSource).toContain(
      "addEventListener('visibilitychange', reapplyCurrentProjection)"
    );
    expect(storyProjectorSource).toContain(
      'if (theme) theme.content = edgeSurface'
    );
    expect(storyProjectorSource).not.toContain('window.getComputedStyle(root)');
    expect(formalShellSource).not.toContain("'pattern-terminal'");
  });

  it('does not let a loaded Grade A root overwrite the active front-stage edge', () => {
    expect(gradeAStorySource).not.toContain('publishEdgeScene(');
    expect(gradeAStorySource).not.toContain('orchestrator.reportPresentation');
    expect(formalShellSource).not.toContain('usePhoneEdgeSurface(');
    expect(formalShellSource).toContain(
      "usePhoneStoryOrchestratorRuntime(\n    'formal',"
    );
    expect(stageRuntimeSource).toContain(
      "if (stageOwner !== 'front') return null"
    );
    expect(stageRuntimeSource).toContain('phoneFrontRailSample');
  });

  it('keeps AOD media-owned without converting the front rail to timed ink', () => {
    expect(stageRuntimeSource).toContain(
      "run === 'aod-method'"
    );
    expect(stageRuntimeSource).toContain('createPhoneAodPresentationGate');
    expect(stageRuntimeSource).toContain('aodAdapter.startAutoplay(');
    expect(stageRuntimeSource).toContain('session[5](');
    expect(stageRuntimeSource).toContain('reportProgress: session[6]');
    expect(stageRuntimeSource).toContain("session[9]('receiver')");
    expect(stageRuntimeSource).toContain('session[10]();');
    expect(stageRuntimeSource).toContain("'aod:method'");
    expect(stageRuntimeSource).not.toContain(
      "'phone-stage-runtime:aod-method'"
    );
    expect(stageRuntimeSource).not.toContain('aodRun');
    expect(stageRuntimeSource).not.toContain('FRONT_INK_BOUNDARIES');
    expect(stageRuntimeSource).not.toContain('runPhoneTimedTransition');
  });

  it('keeps one opaque edge owner behind every fixed-stage boundary', () => {
    expect(stageStyles).toMatch(
      /portrait-scroll-spike__stage-rail::before\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*var\(--phone-layer-coverage\)[^}]*background:\s*var\(--portrait-edge-surface\)/s
    );
    expect(stageStyles).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed[^}]*background:\s*transparent/s
    );
    expect(phonePresentationLayerZIndex('coverage')).toBeLessThan(
      phonePresentationLayerZIndex('transition-receiver')
    );
    expect(stageStyles).toMatch(
      /\.portrait-scroll-spike\s*\{[^}]*overflow-anchor:\s*none/s
    );
    expect(stageStyles).not.toContain(
      'data-portrait-checkpoint="proof-to-brand"'
    );
    expect(storyStyles).not.toContain('data-phone-group45-stage-active');
    expect(storyStyles).not.toContain('data-phone-group45-stage-scene');
    expect(stageStyles).toContain(
      '[data-phone-surface-role="transition-receiver"]'
    );
    expect(compositeRunnerSource).toContain('resource.session[7](');
    expect(compositeRunnerSource).not.toContain('PhoneCompositeRunStep');
    expect(compositeRunnerSource).not.toContain('run.step');
    expect(compositeRunnerSource).not.toContain('runPhoneProgressClock(');
    expect(compositeRunnerSource).toContain('resource.session[12](');
    expect(compositeRunnerSource).not.toContain('options.onSettled(');
    expect(gradeAStorySource).toContain('usePhoneStorySnapshot');
    expect(gradeAStorySource).toContain("'method-grade-a',");
    expect(gradeAStorySource).toContain(
      "status === 'transaction'"
    );
    expect(gradeAStorySource).not.toContain('activeInk?.id');
  });

  it('keeps Method flat while Figure3 owns the single authored paper wash', () => {
    expect(aodStyles).toContain('--portrait-reading-paper: #ede4d2');
    expect(methodStyles).toContain(
      'background: var(--portrait-reading-paper);'
    );
    expect(methodStyles).not.toMatch(
      /background:\s*var\(--portrait-reading-paper-treatment\)/
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
    expect(compositeRunnerSource).not.toContain(
      'acquirePhoneFlowEndpointAlignment'
    );
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
    expect(figure3Scene).toContain(
      'PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS'
    );
    expect(figure3Scene).toContain(
      'root.dataset.phoneFigure3FallbackEndpoint = label'
    );
    expect(figure3Styles).toContain(
      'assets/figure3-initial-paper.webp'
    );
    expect(figure3Styles).toContain(
      'assets/figure3-terminal-paper.webp'
    );
    expect(figure3Scene).toContain('preparePhoneTimelineVideoFrame');
    expect(figure3Scene).toContain('PhoneTimelineVideoInput');
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
    expect(brandFigure3Transition).toContain('createPhoneInkAdapter');
    expect(brandFigure3Transition).toContain('PHONE_BRAND_FIGURE3_FIELD');
    expect(brandFigure3Transition).toContain("'bottom-to-top'");
    expect(brandFigure3Transition).toContain("'brand-figure3'");
    expect(brandFigure3Transition).not.toMatch(/direction:\s*['"]bottom-to-top['"]/);
    expect(brandFigure3Transition).not.toMatch(/seed:\s*['"]brand-figure3['"]/);
    expect(brandFigure3Transition).not.toContain('maskSource: false');
    expect(brandFigure3Transition).not.toContain("strategy: 'endpoint-dissolve'");
  });

  it('owns both directions through one capture-phase semantic lock', () => {
    expect(storySource).toContain('createPhoneCompositeRunner');
    expect(compositeRunnerSource).toContain(
      'registerPhoneCompositeRunCapability('
    );
    expect(compositeRunnerSource).toContain('phoneRuntimeRunDependencies');
    expect(compositeRunnerSource).not.toContain('phoneRuntimeRunLeg');
    expect(compositeRunnerSource).toContain('options.runForVisual(scene)');
    expect(storySource).toContain('BRAND_READING_HOLD_RATIO = .16');
    expect(storySource).not.toContain('phoneBrandLabCompositeAnchor');
    expect(compositeRunnerSource).toContain(
      '(direction) => options.position(scene, direction)'
    );
    expect(storySource).not.toContain('trackTop - window.innerHeight');
    expect(transitionCoordinatorSource).toContain(
      "root.addEventListener('touchmove', onTouchMove, blocking)"
    );
    expect(transitionCoordinatorSource).toContain(
      'const blocking = { passive: false, capture: true }'
    );
    expect(transitionCoordinatorSource).toContain(
      'phoneTransitionCrossesBoundary('
    );
    expect(compositeRunnerSource).toContain(
      'options.capabilities.waitFor(dependencies'
    );
    expect(compositeRunnerSource).toContain(
      'const prepareTarget = config.visual.prepareTargetPresentation'
    );
    expect(storySource).not.toContain('visualRunPhaseRef');
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
    expect(ttgStyles).toMatch(
      /video\.ttg-layer--figure:not\(\[data-phone-ttg-endpoint-ready\]\)\s*\{[^}]*opacity:\s*0/s
    );
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
