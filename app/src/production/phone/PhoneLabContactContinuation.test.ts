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
  new URL('./phone-story-runtime.ts', import.meta.url),
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
    expect(runtimeSource).toContain('...definition.dependencies.transitions');
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
    expect(source).toContain('if (!directEntryGeometryReady()) return null;');
  });

  it('uses the persistent stage canvas as coverage root for every Group 67 surface', () => {
    expect(source).toMatch(
      /`native:\$\{scene\}`,[\s\S]*?\(\) => rootForScene\(scene\),\s*\(\) => stageHost,/
    );
    expect(source).toMatch(
      /id,[\s\S]*?\(\) => ref\.current\?\.root\(\) \?\? null,\s*\(\) => stageHost,/
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

  it('rejects nullable or current-session media labels instead of relabeling stale events', () => {
    expect(source).toContain('phoneLabContactAutoplayToken(detail)');
    expect(source).toContain('const [scene, phase, direction, , progress] = detail;');
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
});
