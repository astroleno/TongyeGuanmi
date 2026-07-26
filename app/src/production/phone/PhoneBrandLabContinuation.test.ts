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
    expect(compositeRunnerSource).toContain('run.session.reportEndpoints');
    expect(compositeRunnerSource).not.toContain('beginPhoneSurfaceRoleTransaction');
    expect(compositeRunnerSource).toContain("'preparing-target'");
    expect(source).not.toContain("'media-failure'");
    expect(compositeRunnerSource).not.toContain("'media-failure'");
    expect(source).not.toContain('failedVisualsRef');
    expect(source).not.toContain('visualRunPhaseRef');
    expect(source).not.toContain('registerPhoneTransitionBoundary');
    expect(source).not.toContain('orchestrator.reportPresentation');
  });

  it('registers the composite runner after the lazy document root mounts', () => {
    expect(source).toMatch(
      /\}, \[\s*adapters\.rootReady,\s*capabilities,\s*orchestrator,\s*reducedMotion\s*\]\);/
    );
  });

  it('does not overwrite a neighbouring transition surface owner', () => {
    expect(source).toContain('orchestrator.registerStableSceneAdapter');
    expect(source).not.toContain('orchestrator.subscribe');
    expect(source).not.toContain(
      "if (!activeRun && cursor.kind === 'hold')"
    );
    expect(source).not.toContain(': currentSceneRef.current;');
  });
});
