import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  formalPhoneOwnershipViolations,
  formalPhoneRouteGraphViolations,
  literalModuleGraph,
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
const runDefinitionsSource = readFileSync(
  new URL('../src/production/phone/phone-story-runs.ts', import.meta.url),
  'utf8'
);
const runLandingSource = readFileSync(
  new URL('../src/production/phone/phone-run-landing.ts', import.meta.url),
  'utf8'
);

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
});
