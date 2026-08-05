import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneGroup67RunSource } from './phone-lab-contact-runtime';
import { phoneRun } from './phone-story-runs';

const source = readFileSync(
  new URL('./PhoneLabContactContinuation.tsx', import.meta.url),
  'utf8'
);
const compositeRunnerSource = readFileSync(
  new URL('./phone-composite-runner.ts', import.meta.url),
  'utf8'
);
const runtimeSource = readFileSync(
  new URL('./phone-story/runtime.ts', import.meta.url),
  'utf8'
);

describe('PhoneLabContactContinuation recovery contract', () => {
  it('waits for the canonical dependency closure of each composite run', () => {
    expect(phoneRun('lab-education').dependencies).toEqual({
      scenes: ['lab', 'ph-animation', 'education'],
      transitions: ['lab-ph', 'ph-education']
    });
    expect(phoneRun('education-contact').dependencies).toEqual({
      scenes: ['education', 'crane-animation', 'contact'],
      transitions: ['education-crane', 'crane-contact']
    });
    expect(source).toContain('createPhoneCompositeRunner');
    expect(compositeRunnerSource).toContain(
      'options.capabilities.waitFor(dependencies'
    );
    expect(compositeRunnerSource).toContain(
      'retention: options.capabilities.retain(dependencies)'
    );
    expect(compositeRunnerSource).toContain('phoneRuntimeRunDependencies(');
    expect(runtimeSource).toContain('phoneRunLegTuple(run, legIndex);');
    expect(runtimeSource).toContain('phoneRunDependencies(run);');
    expect(runtimeSource).not.toContain('definition.dependencies');
  });

  it('keeps the actual directional source rendered until the orchestrator settles', () => {
    expect(phoneGroup67RunSource('ph-animation', 1)).toBe('lab');
    expect(phoneGroup67RunSource('ph-animation', -1)).toBe('education');
    expect(phoneGroup67RunSource('crane-animation', 1)).toBe('education');
    expect(phoneGroup67RunSource('crane-animation', -1)).toBe('contact');
    expect(source).toContain('phoneLabContactAdapterScene(');
    expect(source).toContain('registerPhoneRuntimeSurface(');
    expect(source).toContain('usePhoneStorySnapshot');
  });

  it('prewarms the compositor while the source remains the semantic owner', () => {
    expect(source).toContain('phoneLabContactVisualProjection(');
    expect(source).not.toContain('useState<Group67AdapterFocus>');
    expect(source).not.toContain('const [stageScene');
    expect(source).not.toContain('const [prewarmScene');
    expect(source).not.toContain('data-phone-group67-stage-active');
    expect(source).not.toContain('data-phone-group67-layer-active');
    expect(source).not.toContain('data-phone-group67-active-scene');
  });

  it('registers Group67 surfaces and its document corridor through the route runtime', () => {
    expect(source).toContain('registerPhoneRuntimeScrollCorridor(');
    expect(source).toContain("'group67'");
    expect(source).toContain("'group67:ph'");
    expect(source).toContain("'group67:crane'");
  });

  it('resolves Group67 canonical boundaries from route-owned DOM markers when a lazy ref is unavailable', () => {
    expect(source).toContain("root.querySelector<HTMLElement>('#ph-animation')");
    expect(source).toContain("root.querySelector<HTMLElement>('#crane-animation')");
  });

  it('keeps direct Group67 landing behind the full upstream document geometry gate', () => {
    expect(source).toContain("data-phone-group45-document-geometry=\"ready\"");
    expect(source).toContain('phoneDirectEntryGeometryReady([');
    expect(source).toContain('rootForScene(targetScene) !== null');
    expect(source).toContain('if (!directEntryGeometryReady(targetScene)) return null;');
  });

  it('[direct-entry lifecycle cutover] retains the Group67 runtime owner while a target expands its lazy closure', () => {
    expect(source).toContain(
      'const directEntryGeometryReady = (targetScene: ContinuationScene)'
    );
    expect(source).toContain('}, [capabilities, orchestrator, reducedMotion, stageHost]);');
    expect(source).not.toContain(
      '}, [adapters.ready, capabilities, orchestrator, reducedMotion, stageHost]);'
    );
  });

  it('[R5] resolves native-reading landings from the manifest content anchor', () => {
    expect(source).toContain('phoneReadingLandingTarget(');
    expect(source).toContain('phoneScenePresentationTuple(targetScene)[7]');
    expect(source).toMatch(
      /if \(directNativeEntry\)[\s\S]*?nativeReadingLanding\(targetScene\)/
    );
    expect(source).toMatch(
      /phoneScenePresentationTuple\(targetScene\)\[5\] === 'native-reading'[\s\S]*?nativeReadingLanding\(targetScene\)/
    );
  });

  it('uses the persistent stage canvas as coverage root for every Group 67 surface', () => {
    expect(source).toMatch(
      /`native:\$\{scene\}`,[\s\S]*?\(\) => rootForScene\(scene\),\s*\(\) => stageHost(?:\s*,|\s*\))/
    );
    expect(source).toMatch(
      /id,[\s\S]*?\(\) => ref\.current\?\.root\(\) \?\? null,\s*\(\) => stageHost\s*,/
    );
  });

  it('asks the orchestrator to recommit stable roles when lazy adapters bind', () => {
    expect(source).toContain('syncPhoneRuntimeDiagnostics(orchestrator)');
    expect(source).not.toContain('publishStableRoles(currentSceneRef.current)');
    expect(source).not.toContain('publishStableRoles(entryScene)');
  });

  it('requires target presentation and releases failures back to the source', () => {
    expect(compositeRunnerSource).toContain(
      'const prepareTarget = config.visual.prepareTargetPresentation'
    );
    expect(compositeRunnerSource).toContain('await prepareTarget({');
    expect(source).toContain("if (phase === 'failed')");
    expect(source).toContain('runner.failMedia(scene, identity)');
    expect(compositeRunnerSource).toContain('rollback(resource)');
    expect(compositeRunnerSource).toContain('resource.session[13]()');
    expect(source).toContain('phoneLabContactVisualProjection(');
    expect(source).not.toContain('setPrewarmScene');
    expect(source).not.toContain('setStageScene');
    expect(source).not.toContain("'retryable'");
    expect(source).not.toContain("'media-failure'");
    expect(source).not.toContain('phoneGroup67MediaFallback');
  });

  it('[R5] stages a visible reverse media adapter frame before requesting canvas proof', () => {
    expect(source).toContain('prepareReverseMediaFirstFrame');
    expect(compositeRunnerSource).toContain(
      'const PHONE_REVERSE_RAW_FRAME_ADMISSION_PROGRESS = .996;'
    );
  });

  it('rejects nullable or current-session media labels instead of relabeling stale events', () => {
    expect(source).toContain('phoneLabContactAutoplayToken(detail)');
    expect(source).toContain('phoneLabContactAutoplayFrame(detail)');
    expect(source).toContain('const [scene, phase, direction, , progress] = detail;');
    expect(source).toContain('runner.reportMediaFrame(scene, frame)');
    expect(source).not.toContain('runner.execution(detail.scene)');
  });

  it('keeps reverse document alignment leased through the commit frame', () => {
    expect(source).toContain('acquirePhoneDocumentEndpointAlignment(');
    expect(compositeRunnerSource).toContain('resource.session[12](');
    expect(compositeRunnerSource).not.toContain('resource.session[12]({');
    expect(runtimeSource).toContain('session.provideRelease({');
    expect(compositeRunnerSource).toContain('releaseExtra?.()');
    expect(compositeRunnerSource).not.toContain('run.session.moveTo(');
    expect(source).not.toContain('orchestrator.reportPresentation');
  });

  it('lands each document receiver at its natural document coordinate', () => {
    expect(compositeRunnerSource).not.toContain(
      'acquirePhoneFlowEndpointAlignment'
    );
    expect(source).not.toContain('data-phone-flow-endpoint');
  });

  it('[framework admission closure] gives Group67 no scene opt-in or synthesized-proof configuration', () => {
    expect(source.match(/createPhoneCompositeRunner</g)).toHaveLength(1);
    expect(source).toContain("ownerId: 'phone-lab-contact'");
    expect(source).toContain('targetLanding(');
    expect(source).toContain('admission[3]');
    expect(source).not.toContain('rawFrameProofFor:');
    expect(source).not.toContain('reducedStaticSubject:');
    expect(source).not.toContain('reducedAdmissionTargetPosition:');
    expect(source).not.toContain('runner.reportRenderedFrame(');
  });

  it('[execution hard cutover] snapshot projection never writes Group67 media leaves', () => {
    const bridgeStart = source.indexOf(
      'useLayoutEffect(() => {',
      source.indexOf('Snapshot')
    );
    const bridgeEnd = source.indexOf('useEffect(() => () =>', bridgeStart);
    expect(bridgeStart).toBeGreaterThanOrEqual(0);
    expect(bridgeEnd).toBeGreaterThan(bridgeStart);
    const bridge = source.slice(bridgeStart, bridgeEnd);
    expect(bridge).not.toMatch(
      /(?:ph|crane)Ref\.current\?\.(?:update|enter|reverse|leave)\(/
    );
  });

  it('[native direct-entry cutover] registers the manifest-required static leaves as presentation adapters', () => {
    expect(source).toMatch(
      /scene === 'education' \|\| scene === 'contact'[\s\S]*?target\?\.presentPresentation\?\.\(token, report\)[\s\S]*?target\?\.disposePresentation\?\.\(token\)/
    );
  });
});
