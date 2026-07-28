import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  phoneGroup45EntryPresentation
} from './phone-entry-plan';

const source = readFileSync(
  new URL('./PhoneBrandLabContinuation.tsx', import.meta.url),
  'utf8'
);
const compositeRunnerSource = readFileSync(
  new URL('./phone-composite-runner.ts', import.meta.url),
  'utf8'
);
const figure3Source = readFileSync(
  new URL('../../scenes/figure3-animation/phone/PhoneFigure3.tsx', import.meta.url),
  'utf8'
);
const ttgSource = readFileSync(
  new URL('../../scenes/ttg-animation/phone/PhoneTtg.tsx', import.meta.url),
  'utf8'
);

describe('PhoneBrandLabContinuation direct entry presentation', () => {
  it.each([
    ['brand', 'brand-reading', 'brand'],
    ['figure3-animation', 'figure3-stage', 'figure3'],
    ['services', 'services-reading', 'services'],
    ['ttg-animation', 'ttg-stage', 'ttg'],
    ['lab', 'lab-stable', 'lab']
  ] as const)(
    'publishes the semantic checkpoint and edge for %s',
    (scene, checkpoint, edgeScene) => {
      expect(phoneGroup45EntryPresentation(scene)).toEqual({
        checkpoint,
        edgeScene
      });
    }
  );

  it('prepares a real receiver frame and never commits media failure', () => {
    expect(source).toContain('createPhoneCompositeRunner');
    expect(source).toContain('GROUP45_READINESS_TIMEOUT_MS');
    expect(compositeRunnerSource).toContain(
      'const prepareTarget = config.visual.prepareTargetPresentation'
    );
    expect(compositeRunnerSource).toContain('options.capabilities.waitFor');
    expect(compositeRunnerSource).toContain(
      'resource.session[8]'
    );
    expect(compositeRunnerSource).not.toContain('beginPhoneSurfaceRoleTransaction');
    expect(compositeRunnerSource).toContain('PhoneExecutionToken');
    expect(compositeRunnerSource).not.toContain('PhoneExecutionIdentity');
    expect(compositeRunnerSource).toContain('identitiesMatch');
    expect(compositeRunnerSource).not.toContain('PhoneCompositeRunStep');
    expect(source).not.toContain("'media-failure'");
    expect(compositeRunnerSource).not.toContain("'media-failure'");
    expect(source).not.toContain('failedVisualsRef');
    expect(source).not.toContain('visualRunPhaseRef');
    expect(source).not.toContain('registerPhoneTransitionBoundary');
    expect(source).not.toContain('orchestrator.reportPresentation');
  });

  it('registers the composite runner after the lazy document root mounts', () => {
    expect(source).toMatch(
      /\}, \[\s*adapters\.entryReady,\s*adapters\.rootReady,\s*capabilities,\s*orchestrator,\s*reducedMotion,\s*stageHost\s*\]\);/
    );
  });

  it('holds a direct landing until its complete lazy document geometry is ready', () => {
    expect(source).toMatch(
      /phoneDirectEntryGeometryReady\(\[\s*adapters\.entryReady,\s*true\s*\]\)/
    );
    expect(source).toContain('if (!directEntryGeometryReady()) return null;');
    expect(source).toContain('data-phone-group45-document-geometry=');
  });

  it('does not overwrite a neighbouring transition surface owner', () => {
    expect(source).toContain('registerPhoneRuntimeSurface(');
    expect(source).toContain('usePhoneStorySnapshot');
    expect(source).not.toContain(
      "if (!activeRun && cursor.kind === 'hold')"
    );
    expect(source).not.toContain(': currentSceneRef.current;');
    expect(source).not.toContain('commit: () =>');
  });

  it('uses the persistent stage canvas as coverage root for every Group 45 surface', () => {
    expect(source).toMatch(
      /'native:' \+ scene,[\s\S]*?\(\) => rootForScene\(scene\),\s*\(\) => stageHost,/
    );
    expect(source).toMatch(
      /id,[\s\S]*?\(\) => ref\.current\?\.root\(\) \?\? null,\s*\(\) => stageHost,/
    );
  });

  it('[Task 6] projects Group 45 execution from one authority snapshot', () => {
    expect(source).not.toContain('const [adapterScene, setAdapterScene]');
    expect(source).not.toContain('const [scrollDirection, setScrollDirection]');
    expect(source).not.toContain('const [stageScene, setStageScene]');
    expect(source).not.toContain('const [visualActivity, setVisualActivity]');
    expect(source).not.toContain('activeRunRef');
    expect(source).not.toContain('orchestrator.cursor()');
    expect(source).not.toContain("window.addEventListener('scroll'");
    expect(source).not.toContain('data-phone-group45-stage-active');
    expect(source).not.toContain('data-phone-group45-stage-scene');
    expect(source).not.toContain('data-phone-group45-snap');
    expect(source).toContain("'group45',");
    expect(source).toContain("'group45:figure3'");
    expect(source).toContain("'group45:ttg'");
    expect(source).toContain('phoneBrandLabVisualProjection(');
    expect(source).toContain("'figure3-animation'");
    expect(compositeRunnerSource).not.toContain('type ActiveRun');
    expect(compositeRunnerSource).not.toContain('PhoneCompositeRunStep');
    expect(compositeRunnerSource).not.toContain('onRunState');
    expect(compositeRunnerSource).not.toContain('onRunBegin');
    expect(compositeRunnerSource).not.toContain('onMediaActive');
    expect(compositeRunnerSource).not.toContain('run.step');
  });

  it('[Task 6] gives Figure3 and TTG a start-captured authority identity', () => {
    expect(source).toContain('execution={figure3Execution}');
    expect(source).toContain('execution={ttgExecution}');
    expect(figure3Source).toContain('runIdentityRef.current = identity;');
    expect(figure3Source).toContain(
      "completionListenerRef.current?.('figure3-animation', identity);"
    );
    expect(ttgSource).toContain('runIdentityRef.current = identity;');
    expect(ttgSource).toContain(
      "completionListenerRef.current?.('ttg-animation', identity);"
    );
    expect(ttgSource).toContain(
      "mediaErrorListenerRef.current?.('ttg-animation', identity);"
    );
  });
});
