import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  formalPhoneOwnershipViolations,
  formalPhoneRouteGraphViolations,
  literalModuleGraph,
  phoneCrossChunkCompressionPolicyViolations,
  phoneCrossChunkExecutionContractViolations,
  phoneFigure2ExecutionOwnershipViolations,
  phoneLazyAdapterPropReserveViolations,
  phonePresentationTokenReserveViolations,
  phoneStoryPresentationFacadeReserveViolations,
  phoneExecutionOwnershipViolations,
  phoneRuntimePortBoundaryViolations,
  phoneRouteScopeSelectorViolations,
  phoneRunAnchorResolverViolations,
  qaPhoneOwnershipViolations,
  phoneShellDebt,
  phoneShellCssDebt,
  phoneShellCssDebtViolations,
  phoneShellDebtViolations,
  scanPhoneShellCssDebt,
  scanPhoneShellDebt,
  shellZoneRendererImportViolations
} from './verify-homepage-module-boundaries.mjs';

const shellSource = readFileSync(
  new URL('../src/production/phone/PhoneStoryShell.tsx', import.meta.url),
  'utf8'
);
const shellCssSource = readFileSync(
  new URL('../src/production/phone/PhoneStoryShell.css', import.meta.url),
  'utf8'
);
const bootstrapPath = fileURLToPath(new URL(
  '../src/production/phone/PhoneStoryBootstrap.tsx',
  import.meta.url
));
const routeScopeSource = readFileSync(
  new URL('../src/production/phone/phone-route-scope.ts', import.meta.url),
  'utf8'
);
const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const qaShellSource = readFileSync(
  new URL('../src/production/phone/PhoneBrandLabStory.tsx', import.meta.url),
  'utf8'
);
const contextSource = readFileSync(
  new URL('../src/production/phone/PhoneStoryRuntimeContext.tsx', import.meta.url),
  'utf8'
);
const phoneTypesSource = readFileSync(
  new URL('../src/production/phone/types.ts', import.meta.url),
  'utf8'
);
const phonePresentationSource = readFileSync(
  new URL('../src/production/phone/phone-story/presentation.ts', import.meta.url),
  'utf8'
);
const phoneMachineSource = readFileSync(
  new URL('../src/production/phone/phone-story/machine.ts', import.meta.url),
  'utf8'
);
const runDefinitionsSource = readFileSync(
  new URL('../src/production/phone/phone-story-runs.ts', import.meta.url),
  'utf8'
);
const runLandingSource = readFileSync(
  new URL('../src/production/phone/phone-run-landing.ts', import.meta.url),
  'utf8'
);
const crossChunkExecutionSources = [
  'phone-story/machine.ts',
  'phone-story-runs.ts',
  'phone-transition-coordinator.ts',
  'phone-story/runtime.ts',
  'phone-story/runtime/engine.ts',
  'phone-story/runtime/session.ts',
  'phone-story/presentation.ts',
  'types.ts',
  'usePhoneDocumentScrollRuntime.ts',
  'phone-stage-timeline.ts',
  'phone-composite-snapshot.ts',
  'phone-boundary-geometry.ts',
  'phone-lab-contact-timeline.ts',
  'usePhoneStageRuntime.ts',
  'phone-composite-runner.ts',
  'phone-grade-a-runtime.ts'
].map((file) => {
  const url = new URL(`../src/production/phone/${file}`, import.meta.url);
  return { file: fileURLToPath(url), source: readFileSync(url, 'utf8') };
}).concat([
  '../src/scenes/brand/phone/PhoneBrand.tsx',
  '../src/scenes/figure3-animation/phone/PhoneFigure3.tsx',
  '../src/scenes/services/phone/PhoneServices.tsx',
  '../src/scenes/ttg-animation/phone/PhoneTtg.tsx',
  '../src/scenes/ph-animation/phone/PhonePh.tsx',
  '../src/scenes/crane-animation/phone/PhoneCrane.tsx'
].map((relative) => {
  const url = new URL(relative, import.meta.url);
  return { file: fileURLToPath(url), source: readFileSync(url, 'utf8') };
}));

function violationsFor(source) {
  return phoneShellDebtViolations(scanPhoneShellDebt(source));
}

function cssViolationsFor(source) {
  return phoneShellCssDebtViolations(scanPhoneShellCssDebt(source));
}

describe('homepage phone-shell debt ratchet', () => {
  it('accepts the frozen Unit 3 baseline', () => {
    expect(violationsFor(shellSource)).toEqual([]);
  });

  it('rejects a new shell-owned product media key', () => {
    const violations = violationsFor(
      `${shellSource}\nconst NEXT_MEDIA = phoneMediaUrlFor('new-media', 'hero');`
    );
    expect(violations).toContain('new shell-owned media key is forbidden (new-media)');
  });

  it('rejects media ownership hidden behind a non-literal key', () => {
    const violations = violationsFor(
      `${shellSource}\nconst NEXT_MEDIA = phoneMediaUrlFor(mediaId, 'hero');`
    );
    expect(violations).toContain(
      'shell media ownership calls must use literal product media IDs'
    );
  });

  it('rejects a new scene progress threshold but permits tuning an existing value', () => {
    const added = violationsFor(`${shellSource}\nconst PATTERN_FADE_END = 0.5;`);
    expect(added).toContain(
      'new shell-owned progress constant is forbidden (PATTERN_FADE_END)'
    );

    const tuned = shellSource.replace(
      'const PATTERN_MOTION_END = 0.47;',
      'const PATTERN_MOTION_END = 0.471;'
    );
    expect(violationsFor(tuned)).toEqual([]);
  });

  it('rejects another scene root and permits a migrated root to disappear', () => {
    const added = violationsFor(
      `${shellSource}\n<section className="portrait-scroll-spike__scene--figure2" />`
    );
    expect(added).toContain('new shell-owned scene root is forbidden (figure2)');

    const migrated = shellSource.replace(
      'portrait-scroll-spike__scene--star',
      'phone-scene--star'
    );
    expect(violationsFor(migrated)).toEqual([]);
  });

  it('rejects shell growth even when a new line avoids the named debt patterns', () => {
    const currentLines = scanPhoneShellDebt(shellSource).lines;
    const padding = '\nvoid 0;'.repeat(
      phoneShellDebt.maxLines - currentLines + 1
    );
    expect(violationsFor(`${shellSource.trimEnd()}${padding}\n`)).toContain(
      `Unit 3 shell debt grew to ${phoneShellDebt.maxLines + 1} lines `
        + `(ratchet ${phoneShellDebt.maxLines})`
    );
  });

  it('ratchets the shell CSS asset, scene, owner, and line debts', () => {
    expect(cssViolationsFor(shellCssSource)).toEqual([]);
    expect(cssViolationsFor(
      `${shellCssSource.trimEnd()}\n.portrait-scroll-spike__scene--figure2 {}\nvoid 0;\n`
    )).toEqual(expect.arrayContaining([
      'new shell-owned CSS scene root is forbidden (figure2)',
      `Unit 3 shell CSS debt grew to ${phoneShellCssDebt.maxLines + 1} lines `
        + `(ratchet ${phoneShellCssDebt.maxLines})`
    ]));
    expect(cssViolationsFor(
      `${shellCssSource}\n.extra { background: url("../../../../assets/new-scene.webp"); }\n`
    )).toContain(
      'new shell-owned CSS asset URL is forbidden (../../../../assets/new-scene.webp)'
    );
  });

  it('rejects moving renderer ownership into a new top-level phone helper', () => {
    expect(shellZoneRendererImportViolations(
      'hero-runtime.ts',
      '../../scenes/hero/motion'
    )).toContain(
      'new shell-zone renderer import is forbidden '
        + '(hero-runtime.ts -> ../../scenes/hero/motion)'
    );
    expect(shellZoneRendererImportViolations(
      'hero-motion.ts',
      '../../media/packed-alpha-video'
    )).toContain(
      'new shell-zone renderer import is forbidden '
        + '(hero-motion.ts -> ../../media/packed-alpha-video)'
    );
    expect(shellZoneRendererImportViolations(
      'phone-ink.ts',
      '../../transitions/shared/sceneInk'
    )).toEqual([]);
  });

  it('rejects split durable state and duplicate shell publishers', () => {
    const baseline = [
      {
        file: 'PhoneStoryShell.tsx',
        source: 'const authority = usePhoneStoryRuntime(root);'
      },
      {
        file: 'usePhoneStoryRuntime.ts',
        source: 'createPhoneIntentCoordinator(root, onIntent);'
      },
      {
        file: 'PhoneGradeAStory.tsx',
        source: 'registerCapabilities();'
      }
    ];
    expect(formalPhoneOwnershipViolations(baseline)).toEqual([]);
    expect(formalPhoneOwnershipViolations([
      ...baseline,
      {
        file: 'PhoneBrandLabContinuation.tsx',
        source: 'const visualRunPhaseRef = useRef("idle");'
      }
    ])).toContain(
      'PhoneBrandLabContinuation.tsx: visualRunPhaseRef is forbidden'
    );
    expect(formalPhoneOwnershipViolations([
      ...baseline,
      {
        file: 'PhoneLabContactContinuation.tsx',
        source: 'usePhoneCheckpointPublisher(root);'
      }
    ])).toContain('PhoneLabContactContinuation.tsx: callback or React edge/checkpoint publisher is forbidden');
  });

  it('[Task 11] resolves Figure2 renderer imports and rejects every non-leaf writer', () => {
    const leaf = {
      file: 'src/production/phone/scenes/PhoneFigure2.tsx',
      source: `
        import { renderFigure2AnimationProgress as render } from '../../../scenes/figure2-animation';
        render(root, progress);
      `
    };
    const aliasedTransitionWriter = {
      file: 'src/production/phone/transitions/figure2-distance-expand.tsx',
      source: `
        import { renderFigure2AnimationProgress as draw } from '../../../scenes/figure2-animation';
        draw(root, progress);
      `
    };
    const handleWriter = {
      file: 'src/production/phone/PhoneGradeAStory.tsx',
      source: 'figure2Ref.current?.update?.(1);'
    };
    const leafLegacyWriter = {
      file: 'src/production/phone/scenes/PhoneFigure2.tsx',
      source: `
        import { ensureFigure2HoldFrame } from '../../../scenes/figure2-animation';
        ensureFigure2HoldFrame(root);
      `
    };
    const localSameName = {
      file: 'src/production/phone/transitions/local.ts',
      source: `
        function renderFigure2AnimationProgress() {}
        renderFigure2AnimationProgress();
      `
    };
    const legacyProofWriter = {
      file: 'src/production/phone/phone-grade-a-runtime.ts',
      source: 'session[5]("effect-frame", "grade-a:ink");'
    };

    expect(phoneFigure2ExecutionOwnershipViolations([leaf])).toEqual([]);
    expect(phoneFigure2ExecutionOwnershipViolations([
      aliasedTransitionWriter,
      handleWriter,
      localSameName,
      leafLegacyWriter
    ])).toEqual([
      'src/production/phone/transitions/figure2-distance-expand.tsx: Figure2 renderer write imported as draw is only allowed in PhoneFigure2.tsx',
      'src/production/phone/PhoneGradeAStory.tsx: figure2Ref.current.update is a forbidden Figure2 imperative writer',
      'src/production/phone/scenes/PhoneFigure2.tsx: ensureFigure2HoldFrame bypasses the leaf-owned Figure2 media plan'
    ]);
    expect(phoneFigure2ExecutionOwnershipViolations([
      legacyProofWriter
    ])).toEqual([
      'src/production/phone/phone-grade-a-runtime.ts: session[5] generic proof synthesis is forbidden; forward the exact raw leaf frame through session[16]'
    ]);
  });

  it('[Task 9] recursively excludes QA and legacy shells from the formal import graph', async () => {
    const graph = await literalModuleGraph([bootstrapPath]);

    expect(formalPhoneRouteGraphViolations(graph)).toEqual([]);
    expect([...graph.keys()].map((file) => file.split('/').at(-1))).toEqual(
      expect.arrayContaining([
        'PhoneStoryShell.tsx',
        'runtime.ts',
        'PhoneBrandLabContinuation.tsx',
        'PhoneLabContactContinuation.tsx'
      ])
    );
    expect([...graph.keys()].map((file) => file.split('/').at(-1))).not.toEqual(
      expect.arrayContaining([
        'PhoneBrandLabStory.tsx',
        'PhoneBrandLabScope.tsx',
        'PhoneLabContactShell.tsx'
      ])
    );
  });

  it('[Task 9] rejects alternate factory, input, scroll, and presentation owners', () => {
    const baseline = [
      ['phone-story/runtime.ts', [
        'createPhoneStoryRuntime({});',
        'createPhoneStoryRuntimeEngine({});',
        'createPhoneIntentCoordinator();',
        'createPhoneDocumentScrollRuntime();'
      ].join('\n')],
      ['usePhoneStoryRuntime.ts', 'createPhoneStoryRuntimeForReact();']
    ];
    expect(phoneExecutionOwnershipViolations(baseline)).toEqual([]);

    const violations = phoneExecutionOwnershipViolations([
      ...baseline,
      ['PhoneBrandLabContinuation.tsx', [
        'createPhoneStoryRuntime({});',
        'const sharedAuthority = createPhoneStoryRuntime({});',
        'window.scrollTo(0, 0);',
        "inputTarget.addEventListener('wheel', onWheel);",
        'const [scene] = useState<SceneId>();',
        'const activeRunRef = useRef();',
        'port.cursor();'
      ].join('\n')]
    ]);
    expect(violations).toEqual(expect.arrayContaining([
      'PhoneBrandLabContinuation.tsx: createPhoneStoryRuntime may only be assembled by src/production/phone/phone-story/runtime.ts',
      'PhoneBrandLabContinuation.tsx: module-scope authority/store singleton is forbidden',
      'PhoneBrandLabContinuation.tsx: child-owned scroll command is forbidden',
      'PhoneBrandLabContinuation.tsx: child-owned wheel/touch/document-scroll listener is forbidden',
      'PhoneBrandLabContinuation.tsx: component-owned SceneId presentation state is forbidden',
      'PhoneBrandLabContinuation.tsx: component-owned run presentation state is forbidden',
      'PhoneBrandLabContinuation.tsx: cursor() compatibility access is forbidden'
    ]));
  });

  it('[Task 9] keeps pathname scope selection and run-anchor resolution explicit', () => {
    expect(phoneRouteScopeSelectorViolations({
      mainSource,
      routeScopeSource,
      formalShellSource: shellSource,
      qaShellSource
    })).toEqual([]);
    expect(phoneRouteScopeSelectorViolations({
      mainSource: [
        'function phoneBrandLabScopeRequested(): boolean {',
        "  return window.location.hash === '#lab';",
        '}'
      ].join('\n'),
      routeScopeSource,
      formalShellSource: shellSource,
      qaShellSource
    })).toEqual(expect.arrayContaining([
      'main.tsx: QA scope must be selected only through normalized pathname',
      'main.tsx: formal query/hash must not select the QA authority'
    ]));
    expect(phoneRouteScopeSelectorViolations({
      mainSource: [
        'function phoneBrandLabScopeRequested(): boolean {',
        "  const scope = phoneRouteScopeForPathname(window.location.pathname);",
        "  if (scope === 'brand-lab') { return true; }",
        "  return window.location.search === '?scope=brand-lab';",
        '}'
      ].join('\n'),
      routeScopeSource,
      formalShellSource: shellSource,
      qaShellSource
    })).toContain('main.tsx: formal query/hash must not select the QA authority');
    expect(phoneRunAnchorResolverViolations({
      definitionsSource: runDefinitionsSource,
      resolverSource: runLandingSource
    })).toEqual([]);
    expect(phoneRunAnchorResolverViolations({
      definitionsSource: runDefinitionsSource,
      resolverSource: runLandingSource.replace("case 'preserve-composite':", '')
    })).toContain(
      'phone-run-landing.ts: missing preserve-composite anchor resolver case'
    );
  });

  it('[Task 9] keeps QA read-only and Context lifecycle-free', () => {
    expect(qaPhoneOwnershipViolations(qaShellSource)).toEqual([]);
    expect(qaPhoneOwnershipViolations([
      "import { createPhoneStoryRuntimeEngine } from './phone-story/runtime/engine';",
      'createPhoneStoryRuntime({});',
      'const [display] = useState<SceneId>();',
      'const currentSceneRef = useRef<SceneId>();',
      'inputTarget.addEventListener(\'touchmove\', onTouchMove);'
    ].join('\n'))).toEqual(expect.arrayContaining([
      'PhoneBrandLabStory.tsx: QA scope must not import a low-level execution owner',
      'PhoneBrandLabStory.tsx: QA scope must not construct a low-level execution owner',
      'PhoneBrandLabStory.tsx: QA scope must not own current/stage scene state',
      'PhoneBrandLabStory.tsx: QA scope must not own a document scroll listener'
    ]));
    expect(phoneRuntimePortBoundaryViolations(contextSource)).toEqual([]);
    expect(phoneRuntimePortBoundaryViolations(
      'const Context = createContext<PhoneStoryAuthority | null>(null); value={authority};'
    )).toEqual(expect.arrayContaining([
      'PhoneStoryRuntimeContext.tsx: Context must be typed as PhoneStoryRuntimePort',
      'PhoneStoryRuntimeContext.tsx: Context must expose authority.port only',
      'PhoneStoryRuntimeContext.tsx: Context must not expose route lifecycle authority'
    ]));
  });

  // This recursively parses the full phone graph; parallel release-manifest
  // tests can otherwise exceed Vitest's default 5s despite a valid result.
  it('rejects new raw execution objects at independently minified boundaries', () => {
    expect(phonePresentationSource).toContain(
      'export type PhonePresentationSnapshot = readonly ['
    );
    expect(phoneMachineSource).toContain(
      'export function phonePresentationSnapshot('
    );
    expect(phonePresentationSource).toContain('phoneScrollSegment(');
    expect(phonePresentationSource).toContain('phoneRunLegSegment(');
    expect(runDefinitionsSource).toContain('export type PhoneScrollRunTuple = readonly [');
    expect(runDefinitionsSource).toContain('export type PhoneRunTuple = readonly [');
    expect(runDefinitionsSource).toContain('export type PhoneRunLegTuple = readonly [');
    expect(runDefinitionsSource).toContain('export function phoneScrollRunTuple(');
    expect(runDefinitionsSource).toContain('export function phoneRunTuple(');
    expect(runDefinitionsSource).toContain('export function phoneRunLegTuple(');
    expect(runDefinitionsSource).toContain('export function phoneRunForHoldTuple(');
    expect(phoneCrossChunkCompressionPolicyViolations()).toEqual([]);
    expect(phoneLazyAdapterPropReserveViolations(phoneTypesSource)).toEqual([]);
    expect(phoneStoryPresentationFacadeReserveViolations(phonePresentationSource)).toEqual([]);
    expect(phonePresentationTokenReserveViolations(phoneMachineSource)).toEqual([]);
    expect(phonePresentationTokenReserveViolations(
      phoneMachineSource.replace('subject: PhoneSurfaceId | string;', 'futureToken: string;')
    )).toContain(
      'PresentationToken: field is missing from retained policy (futureToken)'
    );
    expect(phoneStoryPresentationFacadeReserveViolations(
      phonePresentationSource.replace('attach(): void;', 'futureFacade(): void;')
    )).toContain(
      'PhoneStoryPresentation: facade field is missing from retained policy (futureFacade)'
    );
    expect(phoneStoryPresentationFacadeReserveViolations(
      phonePresentationSource.replace(
        'export type PhoneSurfaceRegistration = Readonly<{',
        'export type PhoneSurfaceRegistration = Readonly<{\n  futureBoundary(): void;'
      )
    )).toContain(
      'PhoneStoryPresentation: PhoneSurfaceRegistration field is missing from retained policy (futureBoundary)'
    );
    expect(phoneLazyAdapterPropReserveViolations(
      'export type PhoneFutureAdapterProps = Readonly<{ futureField: string; }>;'
    )).toContain(
      'PhoneFutureAdapterProps: cross-chunk adapter field is missing from mangle reserve (futureField)'
    );
    expect(phoneCrossChunkExecutionContractViolations(
      crossChunkExecutionSources
    )).toEqual([]);
    expect(phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources.filter((entry) => !entry.file.endsWith(
        '/phone-story/machine.ts'
      )),
      {
        file: '/tmp/src/production/phone/phone-story/machine.ts',
        source: 'const definition = phoneRun("aod-method");'
      }
    ])).toContain(
      'machine.ts: raw phone run definitions are forbidden across independently minified chunks'
    );
    const rawIdentity = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/PhoneFutureLazyScene.tsx',
        source: 'import type { PhoneExecutionIdentity } from "./phone-story/machine";'
      }
    ]);
    expect(rawIdentity).toContain(
      'PhoneFutureLazyScene.tsx: raw PhoneExecutionIdentity is forbidden outside authority core'
    );
    const rawEvent = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/usePhoneDocumentScrollRuntime.ts',
        source: 'options.dispatch({ type: "sample" });'
      }
    ]);
    expect(rawEvent).toContain(
      'usePhoneDocumentScrollRuntime.ts: raw dispatch object is forbidden outside runtime event core'
    );
    const rawIntentBridge = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/phone-transition-coordinator.ts',
        source: [
          'export type PhoneIntent = readonly [inputEpoch: number];',
          'onIntent({ inputEpoch: 1 });'
        ].join('\n')
      }
    ]);
    expect(rawIntentBridge).toContain(
      'phone-transition-coordinator.ts: input bridge must use the PhoneIntent positional tuple, not a raw object'
    );
    const indirectRawIntentBridge = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/phone-transition-coordinator.ts',
        source: [
          'export type PhoneIntent = readonly [inputEpoch: number];',
          'const intent = { inputEpoch: 1 };',
          'onIntent(intent);'
        ].join('\n')
      }
    ]);
    expect(indirectRawIntentBridge).toContain(
      'phone-transition-coordinator.ts: input bridge must use the PhoneIntent positional tuple, not a raw object'
    );
    const wrappedRawIntentBridge = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/phone-transition-coordinator.ts',
        source: [
          'export type PhoneIntent = readonly [inputEpoch: number];',
          'function forwardIntent(intent) { onIntent(intent); }',
          'forwardIntent({ inputEpoch: 1 });'
        ].join('\n')
      }
    ]);
    expect(wrappedRawIntentBridge).toContain(
      'phone-transition-coordinator.ts: input bridge must use the PhoneIntent positional tuple, not a raw object'
    );
    const indirectRawEvent = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/usePhoneDocumentScrollRuntime.ts',
        source: [
          'const event = { type: "sample" };',
          'options.dispatch(event);'
        ].join('\n')
      }
    ]);
    expect(indirectRawEvent).toContain(
      'usePhoneDocumentScrollRuntime.ts: raw dispatch object is forbidden outside runtime event core'
    );
    const wrappedRawEvent = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/usePhoneDocumentScrollRuntime.ts',
        source: [
          'function reportEvent(event) { options.dispatch(event); }',
          'reportEvent({ type: "sample" });'
        ].join('\n')
      }
    ]);
    expect(wrappedRawEvent).toContain(
      'usePhoneDocumentScrollRuntime.ts: raw dispatch object is forbidden outside runtime event core'
    );
    const indirectRawCinematic = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/phone-composite-runner.ts',
        source: [
          'const request = { generation: 1, direction: 1 };',
          'runner.begin(request);'
        ].join('\n')
      }
    ]);
    expect(indirectRawCinematic).toContain(
      'phone-composite-runner.ts: raw cinematic request object is forbidden at execution boundary'
    );
    const rawFactory = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/scenes/future/phone/PhoneFuture.tsx',
        source: 'const adapter = createPhoneFutureAdapter({ direction: 1 });'
      }
    ]);
    expect(rawFactory).toContain(
      'PhoneFuture.tsx: raw create/usePhone object contract is forbidden at lazy execution boundary'
    );
    const rawTimeline = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/transitions/future.tsx',
        source: 'const timeline = transition.buildTimeline({ runId: "future:1" });'
      }
    ]);
    expect(rawTimeline).toContain(
      'future.tsx: raw timeline context object is forbidden at lazy execution boundary'
    );
    const rawPhoneInkRuntime = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/phone-ink.ts',
        source: 'const renderer = createInkFieldRenderer(canvas, {});'
      }
    ]);
    expect(rawPhoneInkRuntime).toContain(
      'phone-ink.ts: Phone ink must delegate renderer objects through phone-ink-runtime'
    );
    const rawTimelineRuntime = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/scenes/ttg-animation/phone/PhoneTtg.tsx',
        source: 'driveTimelineVideo(video, { runId: "future:1" });'
      }
    ]);
    expect(rawTimelineRuntime).toContain(
      'PhoneTtg.tsx: Timeline driver data must use phone-timeline-runtime tuples'
    );
    const rawHeroRadialInk = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/scenes/PhoneHero.tsx',
        source: 'createRadialInkIntroController({ generation: "future" });'
      }
    ]);
    expect(rawHeroRadialInk).toContain(
      'PhoneHero.tsx: Hero radial ink must delegate field objects through phone-ink-runtime'
    );
    const unreservedFactory = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/scenes/PhoneHero.tsx',
        source: 'createPhoneNativeAutoplay(video, { durationSeconds: 1 });'
      }
    ]);
    expect(unreservedFactory).toContain(
      'PhoneHero.tsx: raw createPhoneNativeAutoplay object contract is forbidden without a retained policy or tuple bridge'
    );
    const unknownRawFactory = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/scenes/PhoneFuture.tsx',
        source: 'const runtime = createFutureRuntime({ generation: 1 });'
      }
    ]);
    expect(unknownRawFactory).toContain(
      'PhoneFuture.tsx: raw createFutureRuntime object contract is forbidden without a tuple bridge or retained policy'
    );
    const indirectRawFactory = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/scenes/PhoneFuture.tsx',
        source: [
          'const futureOptions = { generation: 1 };',
          'const runtime = createFutureRuntime(futureOptions);'
        ].join('\n')
      }
    ]);
    expect(indirectRawFactory).toContain(
      'PhoneFuture.tsx: raw createFutureRuntime object contract is forbidden without a tuple bridge or retained policy'
    );
    const aliasedRawFactory = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/scenes/PhoneFuture.tsx',
        source: [
          'const futureOptions = { generation: 1 };',
          'const forwardedOptions = futureOptions;',
          'const runtime = createFutureRuntime(forwardedOptions);'
        ].join('\n')
      }
    ]);
    expect(aliasedRawFactory).toContain(
      'PhoneFuture.tsx: raw createFutureRuntime object contract is forbidden without a tuple bridge or retained policy'
    );
    const wrappedRawFactory = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/scenes/PhoneFuture.tsx',
        source: [
          'function startFutureRuntime(options) {',
          '  return createFutureRuntime(options);',
          '}',
          'startFutureRuntime({ generation: 1 });'
        ].join('\n')
      }
    ]);
    expect(wrappedRawFactory).toContain(
      'PhoneFuture.tsx: raw createFutureRuntime object contract is forbidden without a tuple bridge or retained policy'
    );
    const unknownRawMember = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/production/phone/scenes/PhoneFuture.tsx',
        source: 'futureRuntime.render({ generation: 1 });'
      }
    ]);
    expect(unknownRawMember).toContain(
      'PhoneFuture.tsx: raw futureRuntime.render object contract is forbidden without a tuple bridge or retained policy'
    );
    const unretainedField = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/scenes/ph-animation/phone/PhonePh.tsx',
        source: 'createPhoneNativeAutoplay({ durationSeconds: 1, futureField: true });'
      }
    ]);
    expect(unretainedField).toContain(
      'PhonePh.tsx: raw createPhoneNativeAutoplay field futureField is missing from retained policy'
    );
    const indirectUnretainedField = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/scenes/ph-animation/phone/PhonePh.tsx',
        source: [
          'const autoplayOptions = { durationSeconds: 1, futureField: true };',
          'createPhoneNativeAutoplay(autoplayOptions);'
        ].join('\n')
      }
    ]);
    expect(indirectUnretainedField).toContain(
      'PhonePh.tsx: raw createPhoneNativeAutoplay field futureField is missing from retained policy'
    );
    const wrappedUnretainedField = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/src/scenes/ph-animation/phone/PhonePh.tsx',
        source: [
          'function startNativeAutoplay(options) {',
          '  return createPhoneNativeAutoplay(options);',
          '}',
          'startNativeAutoplay({ durationSeconds: 1, futureField: true });'
        ].join('\n')
      }
    ]);
    expect(wrappedUnretainedField).toContain(
      'PhonePh.tsx: raw createPhoneNativeAutoplay field futureField is missing from retained policy'
    );
    expect(phoneCrossChunkCompressionPolicyViolations({
      schemaVersion: 2,
      reservedPropertyNames: [],
      retainedObjectContracts: [{
        name: 'future-contract',
        callees: ['createFutureRuntime'],
        sourceSuffixes: ['src/future.ts'],
        propertyNames: ['generation']
      }]
    })).toContain(
      'future-contract: retained object field is missing from mangle reserve (generation)'
    );
  }, 15_000);
});
