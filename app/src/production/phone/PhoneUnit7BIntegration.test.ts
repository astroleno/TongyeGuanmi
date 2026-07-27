import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneGroup67RunSource } from './phone-lab-contact-runtime';
import { phoneRun } from './phone-story-runs';

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
const compositeRunnerSource = readFileSync(
  new URL('./phone-composite-runner.ts', import.meta.url),
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
    expect(gradeASource).toContain('<PhoneLabContactContinuation');
    expect(gradeASource).not.toContain('PhoneLabContactShell');
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

  it('reuses the exact Unit7-A Lab root and adapter for Lab → PH', () => {
    expect(gradeASource).toContain(
      'onLabBoundaryChange={setLabBoundary}'
    );
    expect(gradeASource).toContain('labBoundary={labBoundary}');
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

  it('uses the same completion latch for reduced motion and stable Contact', () => {
    expect(compositeRunnerSource).toContain(
      'if (options.reducedMotion) settleReduced(run, config)'
    );
    expect(labContactRuntimeSource).toContain('phoneGroup67RunSource');
    expect(continuationSource).toContain(
      "data-phone-group67-run=\"idle\""
    );
  });

  it('leaves all semantic publication to the shell orchestrator', () => {
    expect(continuationSource).not.toMatch(
      /if \(fromLabBoundary\) \{\s*publishScene\('lab'\)/
    );
    expect(compositeRunnerSource).toContain('if (active) rollback(active)');
    expect(gradeASource).not.toContain('orchestrator.reportPresentation');
    expect(continuationSource).not.toContain(
      'orchestrator.reportPresentation'
    );
    expect(stageRuntimeSource).not.toContain(
      'orchestrator.reportPresentation'
    );
    expect(stageRuntimeSource).toContain('registerScrollCorridor');
    expect(stageRuntimeSource).toContain('phoneFrontRailSample');
    expect(stageRuntimeSource).toContain("id: 'front:hero'");
    expect(stageRuntimeSource).toContain("id: 'front:pattern'");
    expect(stageRuntimeSource).toContain("id: 'front:star'");
    expect(stageRuntimeSource).toContain("id: FRONT_AOD_SURFACE");
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
      'aodRun'
    ]) {
      expect(stageRuntimeSource).not.toContain(legacyOwner);
    }
    expect(continuationSource).not.toContain('onCheckpoint?:');
    expect(continuationSource).not.toContain('onEdgeScene?:');
    expect(continuationSource).not.toContain('onSceneChange?:');
  });

  it('uses global surface roles while scene active props remain resource-only', () => {
    for (const source of [heroSource, starMapSource, aodSource]) {
      expect(source).not.toContain('data-phone-surface-role');
      expect(source).not.toContain('style.visibility');
    }
    expect(starMapSource).toContain('__phoneStarActive');
    expect(aodSource).toContain('`active` is strictly a decoder/compositor lease');
    expect(aodSource).toContain('const autoplayIdentityRef = useRef<PhoneExecutionIdentity | null>(null)');
    expect(aodSource).toContain('startAutoplay(direction, identity)');
    expect(aodSource).toContain('progressListenerRef.current?.(progress, direction, identity)');
    expect(aodSource).toContain('completeListenerRef.current?.(direction, identity)');
    expect(patternCss).not.toContain('.portrait-scroll-spike__pattern-motion::after');
    expect(patternCss).not.toContain('--portrait-pattern-edge-surface');
  });
});
