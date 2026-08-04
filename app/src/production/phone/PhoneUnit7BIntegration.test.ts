import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneGroup67RunSource } from './phone-lab-contact-runtime';
import { phoneRun } from './phone-story-runs';
import { createPhoneStorySnapshot } from './phone-story/machine';

const shellSource = readFileSync(
  new URL('./PhoneStoryShell.tsx', import.meta.url),
  'utf8'
);
const gradeASource = readFileSync(
  new URL('./PhoneGradeAStory.tsx', import.meta.url),
  'utf8'
);
const continuationSource = readFileSync(
  new URL('./PhoneLabContactContinuation.tsx', import.meta.url),
  'utf8'
);
const brandContinuationSource = readFileSync(
  new URL('./PhoneBrandLabContinuation.tsx', import.meta.url),
  'utf8'
);
const continuationBundleSource = readFileSync(
  new URL('./PhoneContinuationBundle.tsx', import.meta.url),
  'utf8'
);
const tailBundleSource = readFileSync(
  new URL('./PhoneStoryTailBundle.tsx', import.meta.url),
  'utf8'
);
const compositeRunnerSource = readFileSync(
  new URL('./phone-composite-runner.ts', import.meta.url),
  'utf8'
);
const brandSceneSource = readFileSync(
  new URL('../../scenes/brand/phone/PhoneBrand.tsx', import.meta.url),
  'utf8'
);
const servicesSceneSource = readFileSync(
  new URL('../../scenes/services/phone/PhoneServices.tsx', import.meta.url),
  'utf8'
);
const labContactRuntimeSource = readFileSync(
  new URL('./phone-lab-contact-runtime.ts', import.meta.url),
  'utf8'
);
const stageRailSource = readFileSync(
  new URL('./PhoneStageRail.tsx', import.meta.url),
  'utf8'
);
const stageRuntimeSource = readFileSync(
  new URL('./usePhoneStageRuntime.ts', import.meta.url),
  'utf8'
);
const navigationRuntimeSource = readFileSync(
  new URL('./usePhoneStoryNavigationRuntime.ts', import.meta.url),
  'utf8'
);
const storyNavSource = readFileSync(
  new URL('../StoryNav.tsx', import.meta.url),
  'utf8'
);
const brandLabStorySource = readFileSync(
  new URL('./PhoneBrandLabStory.tsx', import.meta.url),
  'utf8'
);
const entryRuntimeSource = readFileSync(
  new URL('./usePhoneStoryEntry.ts', import.meta.url),
  'utf8'
);
const methodSource = readFileSync(
  new URL('./scenes/PhoneMethodTop.tsx', import.meta.url),
  'utf8'
);
const inkAdapterSource = readFileSync(
  new URL('./transitions/PhoneInkTransition.tsx', import.meta.url),
  'utf8'
);
const heroSource = readFileSync(
  new URL('./scenes/PhoneHero.tsx', import.meta.url),
  'utf8'
);
const patternCss = readFileSync(
  new URL('./scenes/PhonePattern.css', import.meta.url),
  'utf8'
);
const patternSource = readFileSync(
  new URL('./scenes/PhonePattern.tsx', import.meta.url),
  'utf8'
);
const starMapSource = readFileSync(
  new URL('./scenes/PhoneStarMap.tsx', import.meta.url),
  'utf8'
);
const aodSource = readFileSync(
  new URL('./scenes/PhoneAod.tsx', import.meta.url),
  'utf8'
);

describe('formal Unit7-B phone integration', () => {
  it('embeds the continuation without nesting the Unit6 acceptance shell', () => {
    expect(gradeASource).toContain('<PhoneStoryTailBundle');
    expect(tailBundleSource).toContain('<PhoneBrandLabContinuation');
    expect(tailBundleSource).toContain('<PhoneLabContactContinuation');
    expect(gradeASource).not.toContain('PhoneLabContactShell');
    expect(tailBundleSource).not.toContain('PhoneLabContactShell');
    expect(continuationSource).not.toMatch(/<main\b/);
    expect(continuationSource).not.toContain('StoryNav');
    expect(continuationSource).not.toContain('usePhoneViewportGeometry');
    expect(continuationSource).not.toContain('usePhoneEdgeSurface');
  });

  it('keeps one formal main, persistent stage and navigation owner', () => {
    expect(shellSource.match(/<main\b/g)).toHaveLength(1);
    expect(shellSource.match(/<StoryNav\b/g)).toHaveLength(1);
    expect(stageRailSource.match(/data-portrait-stage-host="persistent"/g))
      .toHaveLength(1);
    expect(continuationSource).not.toContain(
      'data-portrait-stage-host="persistent"'
    );
    expect(continuationSource).toContain(
      'createPortal(stageSurfaces, stageHost)'
    );
  });

  it('keeps every direct entry inside the full reversible formal execution graph', () => {
    expect(shellSource).not.toContain('!directStoryEntry &&');
    expect(shellSource).not.toContain('<PhoneGroup67DirectEntry');
    expect(shellSource).toContain('{MethodTop && (');
    expect(methodSource).toContain('phoneMethodRequestsGradeAAtMount');
  });

  it('[direct-entry preload] carries only leaf-loading intent through the formal tail', () => {
    expect(shellSource).toContain('directEntryScene={entryScene}');
    expect(methodSource).toContain('directEntryScene={directEntryScene}');
    expect(gradeASource).toContain('directEntryScene={directEntryScene}');
    expect(tailBundleSource).toContain('phoneContinuationGroupForScene');
    expect(tailBundleSource).toContain('entryScene: group45EntryScene');
    expect(tailBundleSource).toContain('entryScene: group67EntryScene');
    expect(brandContinuationSource).toContain(
      'useRef(entryScene ?? adapterScene)'
    );
    expect(tailBundleSource).not.toContain('usePhoneStoryRuntimePort');
    expect(tailBundleSource).not.toContain('requestPhoneRuntimeDirectEntry');
  });

  it('registers front surfaces against the physical viewport backdrop and keeps the AOD effect in the frozen content host', () => {
    expect(
      stageRuntimeSource.match(/\(\) => options\.coverageRef\.current\b/g)
    // Five front surfaces require the one real DOM live-viewport backing.
    ).toHaveLength(5);
    expect(
      stageRuntimeSource.match(/\(\) => options\.stageRef\.current\b/g)
    // The AOD→Method effect remains in the frozen content plane.
    ).toHaveLength(1);
    expect(stageRuntimeSource).toContain(
      "'aod-to-method',\n      () => options.stageRef.current"
    );
    expect(gradeASource.match(/\(\) => stageHost\b/g)).toHaveLength(2);
    // Each continuation owns two fixed surfaces and two content-host media
    // registrations; above-both effects are separately routed through the
    // explicit route overlay.
    expect(brandContinuationSource.match(/\(\) => stageHost\b/g)).toHaveLength(4);
    expect(continuationSource.match(/\(\) => stageHost\b/g)).toHaveLength(4);
  });

  it('registers the StarMap surface with its projection-owned ID', () => {
    expect(createPhoneStorySnapshot({
      authorityId: 'front-star-contract',
      scene: 'star-map'
    }).projection.receiverSurface).toBe('front:star-map');
    expect(stageRuntimeSource).toContain("'front:star-map'");
    expect(shellSource).toContain("'front:star-map'");
  });

  it('reuses the exact Unit7-A Lab root and adapter for Lab → PH', () => {
    expect(continuationBundleSource).toContain(
      'onLabBoundaryChange={setLabBoundary}'
    );
    expect(continuationBundleSource).toContain('labBoundary={labBoundary}');
    expect(continuationSource).toContain('from={labBoundary.root}');
    expect(continuationSource).toContain(
      'labBoundaryRef.current?.adapter'
    );
  });

  it('conceals Method document copy with the same Method → Figure2 field', () => {
    expect(methodSource).toContain('ref={setSteps}');
    expect(methodSource).toContain('methodCopySource={steps}');
    expect(methodSource).not.toContain('stepsRef.current');
    expect(gradeASource).toContain('additionalFrom={methodCopySource}');
    expect(inkAdapterSource).toContain('additionalFrom');
  });

  it('claims a visual boundary before waiting for every real receiver', () => {
    expect(phoneRun('lab-education').dependencies).toEqual({
      scenes: ['lab', 'ph-animation', 'education'],
      transitions: ['lab-ph', 'ph-education']
    });
    expect(phoneRun('education-contact').dependencies).toEqual({
      scenes: ['education', 'crane-animation', 'contact'],
      transitions: ['education-crane', 'crane-contact']
    });
    expect(compositeRunnerSource).toContain(
      'options.capabilities.waitFor(dependencies'
    );
    expect(compositeRunnerSource).toContain(
      'config.visual.prepareTargetPresentation'
    );
  });

  it('commits authored endpoints and the strict reverse target chain', () => {
    expect(phoneGroup67RunSource('ph-animation', 1)).toBe('lab');
    expect(phoneGroup67RunSource('crane-animation', 1)).toBe('education');
    expect(phoneGroup67RunSource('crane-animation', -1)).toBe('contact');
    expect(phoneGroup67RunSource('ph-animation', -1)).toBe('education');
    expect(compositeRunnerSource).toContain(
      'config.media.commitEndpoint(endpoint)'
    );
    expect(continuationSource).not.toContain('media-failure');
  });

  it('keeps Group45 reduced motion inside a proof-gated candidate admission', () => {
    expect(compositeRunnerSource).toMatch(
      /if \(options\.reducedMotion\) \{[\s\S]*?startReducedAdmission\(resource, config\);/
    );
    expect(compositeRunnerSource).toMatch(
      /target\.presentPresentation!?\(binding\[0\]/
    );
    expect(compositeRunnerSource).not.toContain('settleReduced');
    expect(compositeRunnerSource).not.toContain('usesRawFrameProof');
    expect(compositeRunnerSource).toContain('phoneRunLegAdmissionTuple(');
    expect(labContactRuntimeSource).toContain('phoneGroup67RunSource');
    expect(continuationSource).toContain('phoneLabContactVisualProjection');
    expect(continuationSource).not.toContain('data-phone-group67-run');
  });

  it('[Group45 proof writer gate] requires native reduced targets to identify their own physical static frame', () => {
    for (const source of [brandSceneSource, servicesSceneSource]) {
      expect(source).toContain("origin: 'leaf-static-poster'");
    }
  });

  it('[Pattern↔StarMap reduced cutover] keeps raw static proof ownership in the canvas leaves', () => {
    for (const source of [patternSource, starMapSource]) {
      expect(source).toContain('presentPresentation(token, report)');
      expect(source).toContain("origin: 'leaf-static-poster'");
      expect(source).not.toMatch(
        /\b(?:reportRenderedFrame|presentationProofToken|proofForRenderedFrame|reportPresentationProof|reportPresentationFrame)\b/
      );
    }
    expect(patternSource).toMatch(
      /binding\.report\(phonePatternStaticPresentationFrame\(/
    );
    expect(starMapSource).toMatch(
      /binding\.report\(phoneStarMapStaticPresentationFrame\(/
    );
    expect(patternSource).toMatch(
      /binding\.proofFrame\s*=\s*window\.requestAnimationFrame\(\(\)\s*=>[\s\S]*?binding\.report\(phonePatternStaticPresentationFrame\(/
    );
    expect(starMapSource).toMatch(
      /binding\.proofFrame\s*=\s*window\.requestAnimationFrame\(\(\)\s*=>[\s\S]*?binding\.report\(phoneStarMapStaticPresentationFrame\(/
    );
    for (const source of [patternSource, starMapSource]) {
      expect(source).not.toMatch(/binding\.report\(\s*\{/);
    }
    expect(stageRuntimeSource).toMatch(
      /'front:pattern'[\s\S]*?options\.patternRef\.current\?\.presentPresentation\?\.\(token, report\)/
    );
    expect(stageRuntimeSource).toMatch(
      /'front:star-map'[\s\S]*?options\.starMapRef\.current\?\.presentPresentation\?\.\(token, report\)/
    );
  });

  it('[AOD↔Method reduced cutover] binds only target leaves to one post-paint static proof', () => {
    expect(aodSource).toContain('presentPresentation(token, report, fail)');
    expect(methodSource).toContain('presentPresentation(token, report)');
    for (const source of [aodSource, methodSource]) {
      expect(source).toContain("origin: 'leaf-static-poster'");
      expect(source).not.toMatch(
        /\b(?:reportRenderedFrame|presentationProofToken|proofForRenderedFrame|reportPresentationProof|reportPresentationFrame|reportEndpointCommit)\b/
      );
    }
    expect(aodSource).toMatch(
      /binding\.paintFrame\s*=\s*window\.requestAnimationFrame\(\(\)\s*=>[\s\S]*?binding\.proofFrame\s*=\s*window\.requestAnimationFrame\(\(\)\s*=>[\s\S]*?phoneAodPresentationFrame\(/
    );
    expect(methodSource).toMatch(
      /binding\.paintFrame\s*=\s*window\.requestAnimationFrame\(\(\)\s*=>[\s\S]*?binding\.proofFrame\s*=\s*window\.requestAnimationFrame\(\(\)\s*=>[\s\S]*?phoneMethodStaticPresentationFrame\(/
    );
    expect(stageRuntimeSource).toMatch(
      /'native:method'[\s\S]*?options\.methodRef\.current\?\.presentPresentation\?\.\(token, report\)/
    );
    expect(stageRuntimeSource).toMatch(
      /options\.reducedMotion,[\s\S]*?present\(execution, report\)[\s\S]*?execution\[1\] === 1 \? methodAdapter : aodAdapter/
    );
  });

  it('leaves all semantic publication to the route-local runtime', () => {
    expect(continuationSource).not.toMatch(
      /if \(fromLabBoundary\) \{\s*publishScene\('lab'\)/
    );
    expect(compositeRunnerSource).toMatch(/catch\s*\{\s*rollback\(resource\);\s*\}/);
    expect(compositeRunnerSource).not.toContain('publishScene');
    expect(compositeRunnerSource).not.toContain('reportPresentation');
    expect(gradeASource).not.toContain('orchestrator.reportPresentation');
    expect(continuationSource).not.toContain(
      'orchestrator.reportPresentation'
    );
    expect(stageRuntimeSource).not.toContain(
      'orchestrator.reportPresentation'
    );
    expect(stageRuntimeSource).toContain(
      'registerPhoneRuntimeSampledScrollCorridor('
    );
    expect(stageRuntimeSource).toContain('registerPhoneRuntimeSurface(');
    expect(stageRuntimeSource).toContain('registerPhoneRuntimeAodCapability(');
    expect(stageRuntimeSource).toContain('PhoneCinematicSnapshot');
    expect(stageRuntimeSource).toContain('phoneFrontRailSample');
    expect(stageRuntimeSource).toContain("'front:hero'");
    expect(stageRuntimeSource).toContain("'front:pattern'");
    expect(stageRuntimeSource).toContain("'front:star-map'");
    expect(stageRuntimeSource).toContain('FRONT_AOD_SURFACE,');
    for (const unsafePortAccess of [
      'options.orchestrator.registerSurface(',
      'options.orchestrator.registerScrollCorridor(',
      'options.orchestrator.registerRunCapability('
    ]) {
      expect(stageRuntimeSource).not.toContain(unsafePortAccess);
    }
    for (const unsafePortAccess of [
      'orchestrator.registerSurface(',
      'orchestrator.registerScrollCorridor(',
      'orchestrator.syncDiagnostics()'
    ]) {
      expect(gradeASource).not.toContain(unsafePortAccess);
    }
    expect(shellSource).toContain('navigation.cinematicSnapshot');
    expect(shellSource).not.toContain('navigation.snapshot.');
    expect(navigationRuntimeSource).toContain(
      'selectPhoneCinematicSnapshot(snapshot)'
    );
    expect(navigationRuntimeSource).toContain('requestPhoneRuntimeNavigation(');
    expect(navigationRuntimeSource).not.toContain('port.getSnapshot().authorityId');
    expect(entryRuntimeSource).toContain('requestPhoneRuntimeBootstrap(');
    expect(entryRuntimeSource).not.toContain(
      'orchestrator.getSnapshot().authorityId'
    );
    expect(gradeASource).toContain(
      'selectPhoneCinematicSnapshot(storySnapshot)'
    );
    // AOD admission reads the authority's current state synchronously in the
    // originating gesture stack, but crosses the lazy-chunk boundary through
    // the runtime-owned positional selector rather than raw snapshot fields.
    expect(stageRuntimeSource).toContain(
      'selectPhoneCinematicSnapshot(options.orchestrator.getSnapshot())'
    );
    expect(stageRuntimeSource).not.toContain(
      'const snapshot = options.orchestrator.getSnapshot();'
    );
    expect(stageRuntimeSource).not.toMatch(
      /\bsnapshot\.(?:session|status)\b/
    );
    expect(stageRuntimeSource).not.toContain('snapshotRef.current[9]');
    expect(gradeASource).not.toMatch(
      /\bsnapshot\.(?:projection|session|scroll|status|run|authorityId)\b/
    );
    for (const legacyOwner of [
      'requestRun',
      'reconcileHold',
      'reconcileScrollHold',
      'reconcileScrollRun',
      'setOwnership',
      'setHeroFigureActive',
      'setPatternActive',
      'setStarVisible',
      'setAodFigureActive',
      'aodRunRef'
    ]) {
      expect(stageRuntimeSource).not.toContain(legacyOwner);
    }
    expect(continuationSource).not.toContain('onCheckpoint?:');
    expect(continuationSource).not.toContain('onEdgeScene?:');
    expect(continuationSource).not.toContain('onSceneChange?:');
    for (const source of [
      gradeASource,
      continuationBundleSource,
      continuationSource
    ]) {
      expect(source).not.toMatch(
        /data-phone-(?:grade-a|group45|group67)-(?:stage|snap|scene|active|layer)/
      );
    }
  });

  it('keeps navigation scenes on tuple/hash boundaries across lazy chunks', () => {
    expect(shellSource).toContain('currentScene={navigation.cinematicSnapshot[12]}');
    expect(shellSource).not.toContain('navigation.scene');
    expect(brandLabStorySource).toContain(
      'currentScene={navigation.cinematicSnapshot[12]}'
    );
    expect(brandLabStorySource).not.toContain('navigation.scene');
    expect(navigationRuntimeSource).not.toMatch(/\bscene,\s*visible,/);
    expect(storyNavSource).toContain('sceneFromHash(item.hash)');
    expect(storyNavSource).not.toContain('item.scene');
    expect(brandLabStorySource).toContain("item.hash === '#services'");
  });

  it('uses global surface roles while scene active props remain resource-only', () => {
    for (const source of [heroSource, starMapSource, aodSource]) {
      expect(source).not.toContain('data-phone-surface-role');
      expect(source).not.toContain('style.visibility');
    }
    expect(starMapSource).toContain('updateActiveRef.current?.(active)');
    expect(starMapSource).not.toContain('__phoneStarActive');
    expect(aodSource).toContain('`active` is strictly a decoder/compositor lease');
    expect(aodSource).toContain('const autoplayExecutionRef = useRef<PhoneAodExecution | null>(null)');
    expect(aodSource).toContain('startAutoplay(execution)');
    expect(aodSource).toContain('renderAutoplayProgress(execution, progress)');
    expect(aodSource).not.toContain('admissionRef');
    expect(aodSource).not.toContain('releaseAutoplayAdmission');
    expect(aodSource).toContain('progressListenerRef.current?.(progress, execution)');
    expect(aodSource).toContain('completeListenerRef.current?.(execution)');
    expect(patternCss).not.toContain('.portrait-scroll-spike__pattern-motion::after');
    expect(patternCss).not.toContain('--portrait-pattern-edge-surface');
  });
});
