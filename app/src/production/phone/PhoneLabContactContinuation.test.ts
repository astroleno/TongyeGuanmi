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
    expect(source).toContain('phoneGroup67RunSource(visual, cinematicDirection)');
    expect(source).toContain('registerPhoneRuntimeSurface(');
    expect(source).toContain('usePhoneStorySnapshot');
  });

  it('prewarms the compositor while the source remains the semantic owner', () => {
    expect(source).toContain(
      'const presentedStageScene = stageScene ?? prewarmScene'
    );
    expect(source).toContain('setPrewarmScene(visual)');
    expect(source).toContain(
      "active={stageScene === 'ph-animation'}"
    );
    expect(source).toContain(
      "active={stageScene === 'crane-animation'}"
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
    expect(source).toContain("detail.phase === 'failed'");
    expect(source).toContain('runner.failMedia(detail.scene, identity)');
    expect(compositeRunnerSource).toContain('rollback(resource)');
    expect(compositeRunnerSource).toContain('resource.session[13]()');
    expect(source).toContain('setPrewarmScene(null)');
    expect(source).toContain('setStageScene(null)');
    expect(source).not.toContain("'retryable'");
    expect(source).not.toContain("'media-failure'");
    expect(source).not.toContain('phoneGroup67MediaFallback');
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
