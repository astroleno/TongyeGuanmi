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
const labSource = readFileSync(
  new URL('../../scenes/lab/phone/PhoneLab.tsx', import.meta.url),
  'utf8'
);
const servicesSource = readFileSync(
  new URL('../../scenes/services/phone/PhoneServices.tsx', import.meta.url),
  'utf8'
);
const inkSource = readFileSync(
  new URL('./transitions/PhoneInkTransition.tsx', import.meta.url),
  'utf8'
);
const group45ContractSource = readFileSync(
  new URL('./adapter-groups/group4-5.ts', import.meta.url),
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

  it('[R5] stages reverse media before a decoder can report its first physical frame', () => {
    expect(source).toContain('prepareReverseMediaFirstFrame');
    expect(compositeRunnerSource).toContain(
      'const PHONE_REVERSE_RAW_FRAME_ADMISSION_PROGRESS = .996;'
    );
  });

  it('[Group45 cutover] routes only immutable raw leaf frames into the composite runner', () => {
    expect(group45ContractSource).toMatch(
      /onPresentedFrame\?: \(\s*scene: Group45PhoneSceneId,\s*frame: PhoneRenderedPresentationFrame\s*\) => void/
    );
    expect(source).toMatch(
      /const onVisualFrame = useCallback\(\(\s*scene: Group45PhoneSceneId,\s*frame: PhoneRenderedPresentationFrame/
    );
    expect(source).toContain('runner.reportMediaFrame(scene, frame);');
    expect(source).not.toContain('runner.reportMediaFrame(scene, identity);');
  });

  it('[Group45 hard cutover] keeps one runner owner and no Group45 generic-proof writer', () => {
    expect(source.match(/createPhoneCompositeRunner</g)).toHaveLength(1);
    expect(source).toContain("ownerId: 'phone-brand-lab'");
    expect(source).toContain('targetLanding(_scene, admission)');
    expect(source).not.toContain('rawFrameProof:');
    expect(source).not.toContain('reducedStaticSubject:');
    expect(source).not.toContain('reducedAdmissionTargetPosition:');
    for (const group45Source of [
      source,
      group45ContractSource,
      figure3Source,
      ttgSource,
      servicesSource,
      labSource,
      inkSource
    ]) {
      expect(group45Source).not.toContain('reportRenderedFrame(');
      expect(group45Source).not.toContain('presentationProofToken(');
      expect(group45Source).not.toContain('proofForRenderedFrame(');
    }
  });

  it('[Services↔TTG hard cutover] keeps Lab a raw static leaf, not a second reduced-motion lifecycle', () => {
    expect(source).toMatch(
      /const labRef = useRef<PhoneSceneAdapterHandle \| null>\(null\);/
    );
    expect(labSource).toContain('PhoneSceneAdapterHandle');
    expect(labSource).toContain('presentPresentation(token, report)');
    expect(labSource).toContain("origin: 'leaf-static-poster'");
    expect(labSource).not.toContain('reportRenderedFrame(');
    expect(labSource).not.toContain('presentationProofToken(');
    expect(labSource).not.toContain('proofForRenderedFrame(');
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

  it('[R5] lands native-reading terminal holds on their target document root', () => {
    expect(source).toMatch(
      /phoneScenePresentationTuple\(targetScene\)\[5\] === 'native-reading'[\s\S]*?return phoneDocumentTop\(rootForScene\(targetScene\)\);/
    );
  });

  it('[Services→Brand landing] separates the Figure3 trigger from the visible Brand terminal', () => {
    expect(source).toMatch(
      /if \(scene === 'brand'\) \{\s*return phoneDocumentTop\(rootForScene\(targetScene\)\);\s*\}/
    );
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

  it('never lets the snapshot bridge write native adapters during a transaction', () => {
    const bridge = source.slice(source.indexOf('Snapshot -> adapter bridge'));
    expect(bridge).toContain(
      "if (storySnapshot.status === 'transaction') return;"
    );
    expect(bridge).toMatch(
      /if \(storySnapshot\.status === 'transaction'\) return;[\s\S]*?brandRef\.current\?\.update\(1\)/
    );
  });

  it('uses the persistent stage canvas as coverage root for every Group 45 surface', () => {
    expect(source).toMatch(
      /'native:' \+ scene,[\s\S]*?\(\) => rootForScene\(scene\),\s*\(\) => stageHost(?:\s*,|\s*\))/
    );
    expect(source).toMatch(
      /id,[\s\S]*?\(\) => ref\.current\?\.root\(\) \?\? null,\s*\(\) => stageHost\s*,/
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
    expect(source).toContain('phoneCompositeVisualProjection(');
    expect(source).toContain("'figure3-animation'");
    expect(compositeRunnerSource).not.toContain('type ActiveRun');
    expect(compositeRunnerSource).not.toContain('PhoneCompositeRunStep');
    expect(compositeRunnerSource).not.toContain('onRunState');
    expect(compositeRunnerSource).not.toContain('onRunBegin');
    expect(compositeRunnerSource).not.toContain('onMediaActive');
    expect(compositeRunnerSource).not.toContain('run.step');
  });

  it('[R5] retains the direct target closure while a neighboring group changes focus', () => {
    expect(source).toContain(
      'const entryAdapterSceneRef = useRef(entryScene ?? adapterScene);'
    );
    expect(source).toMatch(
      /usePhoneGroup45Adapters\(\s*entryAdapterSceneRef\.current,\s*adapterScene\s*\)/
    );
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

  it('[Task 6] routes Group45 playback through the runner-issued token command', () => {
    expect(source).toContain('config.visual.play?.(1, identity);');
    expect(source).toContain('config.visual.play?.(-1, identity);');
    expect(figure3Source).toContain('play(runDirection: 1 | -1');
    expect(ttgSource).toContain('play(runDirection: 1 | -1');
  });
});
