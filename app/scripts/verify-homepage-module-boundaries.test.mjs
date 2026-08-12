import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as moduleBoundaryVerifier from './verify-homepage-module-boundaries.mjs';
import {
  formalPhoneOwnershipViolations,
  formalPhoneRouteGraphViolations,
  literalModuleGraph,
  phoneCrossChunkCompressionPolicyViolations,
  phoneCrossChunkExecutionContractViolations,
  phoneLazyAdapterPropReserveViolations,
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
  new URL('../src/production/phone/PhoneStoryOrchestratorContext.tsx', import.meta.url),
  'utf8'
);
const phoneTypesSource = readFileSync(
  new URL('../src/production/phone/types.ts', import.meta.url),
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
const stageRailCssSource = readFileSync(
  new URL('../src/production/phone/PhoneStageRail.css', import.meta.url),
  'utf8'
);
const aodAutoplaySource = readFileSync(
  new URL('../src/production/phone/aod-autoplay.ts', import.meta.url),
  'utf8'
);
const stageRuntimeSource = readFileSync(
  new URL('../src/production/phone/usePhoneStageRuntime.ts', import.meta.url),
  'utf8'
);
const gsapDriverSource = readFileSync(
  new URL('../src/production/phone/phone-gsap-driver.ts', import.meta.url),
  'utf8'
);
const methodStylesSource = readFileSync(
  new URL('../src/production/phone/scenes/PhoneMethodTop.css', import.meta.url),
  'utf8'
);
const navigationStylesSource = readFileSync(
  new URL('../src/production/StoryNav.css', import.meta.url),
  'utf8'
);
const releasePlaywrightConfigSource = readFileSync(
  new URL('../playwright.release.config.ts', import.meta.url),
  'utf8'
);
const crossChunkExecutionSources = [
  'phone-story-state.ts',
  'phone-transition-coordinator.ts',
  'phone-story-runtime.ts',
  'phone-story-orchestrator.ts',
  'phone-orchestrated-session.ts',
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
  '../src/scenes/figure3-animation/phone/PhoneFigure3.tsx',
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
  it('runs the mandatory production phone matrix in portrait touch viewports', () => {
    expect(releasePlaywrightConfigSource).toContain("...devices['Pixel 7']");
    expect(releasePlaywrightConfigSource).toContain("viewport: { width: 390, height: 844 }");
    expect(releasePlaywrightConfigSource).toContain("...devices['iPhone 15']");
    expect(releasePlaywrightConfigSource).not.toContain('landscape');
  });

  it('gates effect layering, viewport coverage, media first frame, and direct reading visibility together', () => {
    const verify = moduleBoundaryVerifier.phoneExecutionPresentationContractViolations;

    expect(verify).toBeTypeOf('function');
    if (typeof verify !== 'function') return;

    const sources = {
      stageRailCssSource,
      shellCssSource,
      aodAutoplaySource,
      stageRuntimeSource,
      gsapDriverSource,
      methodStylesSource,
      navigationStylesSource
    };
    expect(verify(sources)).toEqual([]);
    expect(verify({
      ...sources,
      stageRailCssSource: stageRailCssSource.replace(
        'z-index: 12;\n  inset: 0;\n  display: block;',
        'z-index: 8;\n  inset: 0;\n  display: block;'
      )
    })).toContain(
      'PhoneStageRail.css: shared ink effect must occupy transition lane 12'
    );
    expect(verify({
      ...sources,
      stageRailCssSource: stageRailCssSource.replace(
        '  min-height: var(--portrait-stage-canvas-height);\n',
        ''
      )
    })).toContain(
      'PhoneStageRail.css: stage canvas must span the retained large viewport'
    );
    expect(verify({
      ...sources,
      aodAutoplaySource: aodAutoplaySource.replace(
        "if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'playing';\n        schedule();",
        "if (import.meta.env.DEV) video.dataset.phoneAodAutoplay = 'playing';\n        settleStart('playing');\n        schedule();"
      )
    })).toContain(
      'aod-autoplay.ts: play() resolution must not count as a presented frame'
    );
    expect(verify({
      ...sources,
      gsapDriverSource: gsapDriverSource.replace(
        'immediateRender: false',
        'immediateRender: true'
      )
    })).toContain(
      'phone-gsap-driver.ts: direct reading content must fail open before trigger entry'
    );
    expect(verify({
      ...sources,
      methodStylesSource: methodStylesSource.replace(
        'font-family: var(--font-sans);',
        'font-family: var(--font-traditional);'
      )
    })).toContain(
      'PhoneMethodTop.css: phone WebKit direct headings must use the safe CJK fallback'
    );
    expect(verify({
      ...sources,
      navigationStylesSource: navigationStylesSource.replace(
        'font-family: var(--font-sans);',
        'font-family: var(--font-traditional);'
      )
    })).toContain(
      'StoryNav.css: phone WebKit brand mark must use the safe CJK fallback'
    );
  });

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
        source: 'const authority = usePhoneStoryOrchestratorRuntime(root);'
      },
      {
        file: 'usePhoneStoryOrchestratorRuntime.ts',
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

  it('[Task 9] recursively excludes QA and legacy shells from the formal import graph', async () => {
    const graph = await literalModuleGraph([bootstrapPath]);

    expect(formalPhoneRouteGraphViolations(graph)).toEqual([]);
    expect([...graph.keys()].map((file) => file.split('/').at(-1))).toEqual(
      expect.arrayContaining([
        'PhoneStoryShell.tsx',
        'phone-story-runtime.ts',
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
      ['phone-story-runtime.ts', [
        'createPhoneStoryOrchestrator({});',
        'createPhoneStoryRuntime({});',
        'createPhoneIntentCoordinator();',
        'createPhoneDocumentScrollRuntime();'
      ].join('\n')],
      ['usePhoneStoryOrchestratorRuntime.ts', 'createPhoneStoryRuntimeForReact();']
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
      'PhoneBrandLabContinuation.tsx: createPhoneStoryRuntime may only be assembled by src/production/phone/phone-story-runtime.ts',
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
      "import { createPhoneStoryProjector } from './phone-story-projector';",
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
      'PhoneStoryOrchestratorContext.tsx: Context must be typed as PhoneStoryRuntimePort',
      'PhoneStoryOrchestratorContext.tsx: Context must expose authority.port only',
      'PhoneStoryOrchestratorContext.tsx: Context must not expose route lifecycle authority'
    ]));
  });

  it('rejects new raw execution objects at independently minified boundaries', () => {
    expect(phoneCrossChunkCompressionPolicyViolations()).toEqual([]);
    expect(phoneLazyAdapterPropReserveViolations(phoneTypesSource)).toEqual([]);
    expect(phoneLazyAdapterPropReserveViolations(
      'export type PhoneFutureAdapterProps = Readonly<{ futureField: string; }>;'
    )).toContain(
      'PhoneFutureAdapterProps: cross-chunk adapter field is missing from mangle reserve (futureField)'
    );
    expect(phoneCrossChunkExecutionContractViolations(
      crossChunkExecutionSources
    )).toEqual([]);
    const rawIdentity = phoneCrossChunkExecutionContractViolations([
      ...crossChunkExecutionSources,
      {
        file: '/tmp/PhoneFutureLazyScene.tsx',
        source: 'import type { PhoneExecutionIdentity } from "./phone-story-state";'
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
  });
});
