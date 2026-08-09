import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phonePresentationHostPlaneOrder } from './phone-story/presentation';

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
  new URL('./phone-story/presentation.ts', import.meta.url),
  'utf8'
);
const storyRuntimeSource = readFileSync(
  new URL('./phone-story/runtime.ts', import.meta.url),
  'utf8'
);
const storyProjectorSource = readFileSync(
  new URL('./phone-story/presentation.ts', import.meta.url),
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
const aodSceneSource = readFileSync(
  new URL('./scenes/PhoneAod.tsx', import.meta.url),
  'utf8'
);
const figure2SceneSource = readFileSync(
  new URL('./scenes/PhoneFigure2.tsx', import.meta.url),
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
const ttgScene = readFileSync(
  new URL('../../scenes/ttg-animation/phone/PhoneTtg.tsx', import.meta.url),
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
      "if (theme) theme.setAttribute('content', edgeSurface)"
    );
    expect(storyProjectorSource).not.toContain('theme.content');
    expect(storyProjectorSource).not.toContain('window.getComputedStyle(root)');
    expect(formalShellSource).not.toContain("'pattern-terminal'");
  });

  it('does not let a loaded Grade A root overwrite the active front-stage edge', () => {
    expect(gradeAStorySource).not.toContain('publishEdgeScene(');
    expect(gradeAStorySource).not.toContain('orchestrator.reportPresentation');
    expect(formalShellSource).not.toContain('usePhoneEdgeSurface(');
    expect(formalShellSource).toContain(
      "usePhoneStoryRuntime(\n    'formal',"
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
    expect(stageRuntimeSource).toContain('registerPhoneRuntimeAodCapability(');
    expect(stageRuntimeSource).not.toContain('createPhoneRuntimeAodDriver');
    const aodRunnerSource = storyRuntimeSource.slice(
      storyRuntimeSource.indexOf('export const PHONE_AOD_PREPARE_TIMEOUT_MS'),
      storyRuntimeSource.indexOf('export function syncPhoneRuntimeDiagnostics')
    );
    expect(aodRunnerSource).toContain("port.registerRunCapability('aod-method', 'aod:method'");
    expect(aodRunnerSource).toContain("aodSession.presentationProofToken('packed-canvas-frame', 'front:aod')");
    expect(aodRunnerSource).toContain("aodSession.presentationFrameToken(\n            'static-poster'");
    expect(aodRunnerSource).toContain('beginReducedAdmission(record)');
    expect(aodRunnerSource).toContain('reportPresentationFrame(frame)');
    expect(aodRunnerSource).not.toContain('reportRenderedFrame(');
    expect(aodRunnerSource).not.toContain('proofForRenderedFrame(');
    expect(stageRuntimeSource).toContain('aodAdapter.startAutoplay(');
    expect(stageRuntimeSource).toContain('aodAdapter.renderAutoplayProgress(');
    expect(stageRuntimeSource).not.toContain('releaseAutoplayAdmission(');
    expect(stageRuntimeSource).toContain("'aod-method'");
    expect(stageRuntimeSource).not.toContain(
      "'phone-stage-runtime:aod-method'"
    );
    expect(stageRuntimeSource).not.toMatch(/\baodRun(?:Ref)?\b/);
    expect(stageRuntimeSource).not.toContain('FRONT_INK_BOUNDARIES');
    expect(stageRuntimeSource).not.toContain('runPhoneTimedTransition');
  });

  it('[AOD cutover static gate] has exactly one runner writer and no runtime proof reconstruction', () => {
    const aodRunnerSource = storyRuntimeSource.slice(
      storyRuntimeSource.indexOf('export const PHONE_AOD_PREPARE_TIMEOUT_MS'),
      storyRuntimeSource.indexOf('export function syncPhoneRuntimeDiagnostics')
    );
    expect(
      (aodRunnerSource.match(/registerRunCapability\('aod-method'/g) ?? []).length
    ).toBe(1);
    expect(existsSync(
      new URL('./phone-story/runtime/aod.ts', import.meta.url)
    )).toBe(false);
    expect(aodRunnerSource).toContain('reportPresentationFrame(frame)');
    expect(aodRunnerSource).not.toContain('reportRenderedFrame(');
    expect(aodRunnerSource).not.toContain('proofForRenderedFrame(');
    expect(aodRunnerSource).not.toContain('record[2]');
    expect(aodRunnerSource).not.toContain('.reportProgress(');
    expect((aodRunnerSource.match(/\.reportAodProgress\(/g) ?? []).length).toBe(1);
    expect(aodRunnerSource).toContain("reportAodFailure('aod-autoplay-blocked')");
    expect(aodRunnerSource).toContain('reportAodPlayConfirmed()');
    expect(aodRunnerSource).toContain('reportAodFirstFrame(frame)');
    expect(aodRunnerSource).toContain('reportAodCompleted()');
    expect(aodRunnerSource).toContain("? 'aod-prepare-timeout' : 'aod-progress-timeout'");
    expect(aodRunnerSource).not.toContain('reportAodAutoplayBlocked(');
    expect(aodRunnerSource).not.toContain('requestAodGestureRetry(');
    expect(aodRunnerSource).not.toContain('reportAodWatchdog(');
    expect(aodRunnerSource).toContain('reducedMotion,');
    expect(aodRunnerSource).toContain("frame.origin !== 'leaf-static-poster'");
    expect(stageRuntimeSource).not.toContain('aodRuntime.reset(');
    expect(
      (stageRuntimeSource.match(/aodAdapter\.resetAutoplay\(/g) ?? []).length
    ).toBe(1);
    expect(aodSceneSource).toContain("origin: 'segment-first-frame'");
    expect(aodSceneSource).toContain("origin: 'leaf-static-poster'");
    expect(aodSceneSource).not.toContain('reportRenderedFrame(');
    expect(aodSceneSource).not.toContain('proofForRenderedFrame(');
    expect(aodSceneSource).not.toContain('reportProgress(');
    expect(aodSceneSource).not.toContain('reportPresentationProof(');
    expect(aodSceneSource).not.toContain('reportEndpointCommit(');
    expect(aodSceneSource).not.toContain('admissionRef');
    expect(aodSceneSource).not.toContain('releaseAutoplayAdmission');
    expect(aodSceneSource).toContain('renderAutoplayProgress(execution, progress)');
    const aodStaticTargetProof = aodSceneSource.slice(
      aodSceneSource.indexOf('presentPresentation(token, report, fail)'),
      aodSceneSource.indexOf('disposePresentation(token)')
    );
    expect(aodStaticTargetProof).toContain('phoneRuntimePresentationTokenKey(token)');
    expect(aodStaticTargetProof).toContain('renderRef.current?.(0);');
    expect(aodStaticTargetProof).toContain('if (reducedMotion) {');
    expect(aodStaticTargetProof).toContain('requestBoundStaticPresentation();');
    expect(aodStaticTargetProof).toContain('compositor.render();');
    // Both the reduced static proof and the full-motion canvas proof must
    // describe the authored AOD hold. Star → AOD/direct entry may never
    // project the AOD→Method exit endpoint before that runner owns playback.
    expect(aodSceneSource).toContain('renderRef.current?.(0);');
    expect(aodSceneSource).not.toContain('renderRef.current?.(1);');
    expect(aodSceneSource).toMatch(
      /binding\.paintFrame\s*=\s*window\.requestAnimationFrame\(\(\)\s*=>[\s\S]*?renderRef\.current\?\.\(0\);[\s\S]*?staticSurface\.dataset\.aodStaticPoster\s*=\s*binding\.key;[\s\S]*?binding\.proofFrame\s*=\s*window\.requestAnimationFrame\(\(\)\s*=>[\s\S]*?phoneAodPresentationFrame\(/
    );
    const aodCompositorFrame = aodSceneSource.slice(
      aodSceneSource.indexOf('onFrame: () =>'),
      aodSceneSource.indexOf('compositorRef.current = compositor')
    );
    expect(aodCompositorFrame).toContain(
      'staticSurface.dataset.aodStaticPoster = binding.key;'
    );
    expect(aodCompositorFrame).toContain(
      'binding.proofFrame = window.requestAnimationFrame(() => {'
    );
    expect(aodCompositorFrame).toContain("'leaf-post-paint'");
    expect(aodCompositorFrame).not.toContain('requestBoundStaticPresentation()');
    const reducedAutoplay = aodSceneSource.slice(
      aodSceneSource.indexOf('startAutoplay(execution)'),
      aodSceneSource.indexOf('renderAutoplayProgress(execution, progress)')
    );
    expect(reducedAutoplay).toContain("if (reducedMotion) return Promise.resolve('error')");
    expect(reducedAutoplay).not.toContain('reportAodFrame(execution)');
  });

  it('[Figure2 handle gate] never recreates an unprepared surface from a changing snapshot inside its forwarded handle', () => {
    const imperativeHandleStart = figure2SceneSource.indexOf(
      'useImperativeHandle(forwardedRef'
    );
    const imperativeHandle = figure2SceneSource.slice(
      imperativeHandleStart,
      figure2SceneSource.indexOf('\n\n  return (', imperativeHandleStart)
    );
    expect(imperativeHandle).not.toMatch(/\[\s*[\s\S]*?\bmediaPlan\b[\s\S]*?\]/);
    const presentation = imperativeHandle.slice(
      imperativeHandle.indexOf('presentPresentation(token, report)'),
      imperativeHandle.indexOf('disposePresentation(token)')
    );
    expect(presentation).toContain('const surface = packedSurfaceRef.current;');
    expect(presentation).not.toContain('ensurePackedSurface(');
  });

  it('[execution hard cutover] snapshot projection never writes Group45 media leaves', () => {
    const bridgeStart = storySource.indexOf(
      'useLayoutEffect(() => {',
      storySource.indexOf('Snapshot -> adapter bridge')
    );
    const bridgeEnd = storySource.indexOf('useEffect(() => () =>', bridgeStart);
    expect(bridgeStart).toBeGreaterThanOrEqual(0);
    expect(bridgeEnd).toBeGreaterThan(bridgeStart);
    const bridge = storySource.slice(bridgeStart, bridgeEnd);
    expect(bridge).not.toMatch(
      /(?:figure3|ttg)Ref\.current\?\.(?:update|enter|reverse|leave)\(/
    );
  });

  it('[execution hard cutover] composite rollback never invokes visual lifecycle writers', () => {
    expect(compositeRunnerSource).not.toContain('config.visual.update(');
    expect(compositeRunnerSource).not.toContain('config.visual.leave?.(');
    expect(compositeRunnerSource).toContain(
      "The reducer's rollback projection clears the visual execution"
    );
  });

  it('[execution hard cutover] cinematic leaves expose no lifecycle writers', () => {
    for (const source of [figure3Scene, ttgScene]) {
      const handle = source.slice(source.indexOf('useImperativeHandle'));
      expect(handle).not.toMatch(/\b(update|enter|reverse|leave)\s*\(/);
    }
  });

  it('keeps one opaque edge owner behind every fixed-stage boundary', () => {
    expect(stageStyles).toMatch(
      /portrait-scroll-spike__viewport-coverage\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*var\(--phone-host-plane-coverage\)[^}]*background:\s*var\(--portrait-edge-surface\)/s
    );
    expect(stageStyles).not.toContain('.portrait-scroll-spike__stage-rail::before');
    expect(stageStyles).toMatch(
      /portrait-scroll-spike__stage\s*\{[^}]*position:\s*fixed[^}]*background:\s*transparent/s
    );
    expect(phonePresentationHostPlaneOrder('coverage')).toBeLessThan(
      phonePresentationHostPlaneOrder('content')
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

  it('[P0] keeps Method authored content visible while its proof token is a candidate', () => {
    expect(methodStyles).toMatch(
      /data-phone-surface-role="candidate-stable"\][\s\S]*portrait-scroll-spike__method-bridge/
    );
    expect(methodStyles).toMatch(
      /data-phone-surface-role="stable"\][\s\S]*portrait-scroll-spike__method-bridge/
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
      'phoneFigure3EndpointFrameMatches('
    );
    expect(figure3Scene).toContain(
      "phoneFigure3PaperFrame === 'ready'"
    );
    expect(figure3Scene).not.toContain('PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS');
    expect(figure3Scene).not.toContain('phoneFigure3FallbackEndpoint');
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
