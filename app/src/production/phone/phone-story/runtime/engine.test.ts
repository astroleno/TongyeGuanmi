import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneStoryRuntimeEngine as createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession,
  type PhoneRunCapability
} from './engine';
import { PHONE_REDUCED_ADMISSION_TIMEOUT_MS } from './session';
import type { PhoneStoryRuntimeEngine as PhoneStoryOrchestrator } from './engine';
import {
  phoneDirectEntryAdmissionTuple,
  phoneScenePresentationProofKind,
  phoneScenePresentationTuple,
  phoneSegmentPresentationTuple
} from '../manifest';
import {
  createPhoneStoryPresentation,
  type PhoneRenderedPresentationFrame
} from '../presentation';
import type { PresentationToken } from '../machine';

const sessionSource = readFileSync(new URL('./session.ts', import.meta.url), 'utf8');
const sessionTypesSource = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');

function element(top = 0): HTMLElement {
  const properties = new Map<string, string>();
  return {
    dataset: {} as DOMStringMap,
    style: {
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
      removeProperty(name: string) {
        properties.delete(name);
      },
      getPropertyValue(name: string) {
        return properties.get(name) ?? '';
      }
    },
    getBoundingClientRect: () => ({
      left: 0,
      top,
      right: 390,
      bottom: top + 844,
      width: 390,
      height: 844
    })
  } as unknown as HTMLElement;
}

function capability(
  position: number,
  start: PhoneRunCapability['start']
): PhoneRunCapability {
  return {
    position: () => position,
    canStart: () => true,
    start
  };
}

function intent() {
  return [1, 1, 0, 240] as const;
}

function registerCorridor(
  orchestrator: PhoneStoryOrchestrator,
  run: 'brand-services' | 'lab-education' = 'brand-services',
  boundary = 100
) {
  return orchestrator.registerScrollCorridor({
    id: `test:${run}`,
    scenes: run === 'brand-services' ? ['brand', 'services'] : ['lab', 'education'],
    sample: () => null,
    boundary: (requestedRun) => requestedRun === run ? boundary : null,
    landing: () => boundary
  });
}

/** Register a manifest-scoped target whose content and coverage are real facts. */
function registerReadySurface(
  orchestrator: PhoneStoryOrchestrator,
  scene: Parameters<typeof phoneScenePresentationTuple>[0],
  scheduleLeafFrame?: (callback: () => void) => void
) {
  const root = element();
  const surface = phoneScenePresentationTuple(scene)[4];
  const admission = phoneDirectEntryAdmissionTuple(scene);
  return orchestrator.registerSurface({
    id: surface,
    scene,
    kind: surface.startsWith('native:') ? 'native' : 'fixed',
    root: () => root,
    presentation: () => [true, true, true, true, 'static-poster'],
    ...(admission[6] ? {
      adapter: {
        present(token: PresentationToken, report: (frame: PhoneRenderedPresentationFrame) => void) {
          const publish = () => report({
            token,
            frameSequence: 1,
            observedAt: typeof performance !== 'undefined'
              && typeof performance.now === 'function'
              ? performance.now()
              : 0,
            origin: 'leaf-static-poster'
          });
          if (scheduleLeafFrame) scheduleLeafFrame(publish);
          else publish();
        }
      }
    } : {})
  });
}

function reportSegmentProof(
  session: PhoneOrchestratedRunSession,
  segment: Parameters<typeof phoneSegmentPresentationTuple>[0]
): void {
  const contract = phoneSegmentPresentationTuple(segment);
  const token = session.presentationProofToken(contract[8], contract[9]);
  if (!token) throw new Error('Expected an active segment proof token');
  session.reportPresentationProof({
    token,
    frameSequence: 1,
    observedAt: 1,
    connected: true,
    visible: true,
    coverageComplete: true,
    edge: phoneScenePresentationTuple(contract[3])[1]
  });
}

describe('single phone story projector transaction', () => {
  it('[direct admission writer gate] keeps target layout out of leaf sessions', () => {
    const leafSessionContract = sessionTypesSource.slice(
      sessionTypesSource.indexOf('export type PhoneOrchestratedRunSession'),
      sessionTypesSource.indexOf('export type PhoneAodRunSession')
    );
    expect(leafSessionContract).not.toContain('requestDirectEntryTargetLayout');
    expect(sessionSource).toContain('requestDirectEntryTargetLayout() {');
    expect(sessionSource).toContain("emit(run, 'TARGET_LAYOUT_REQUESTED')");
    expect(engineSource).toContain('sessions.requestDirectEntryTargetLayout();');
  });

  it('[Task 9] exposes snapshots without the deprecated cursor compatibility API', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand'
    });
    expect(orchestrator).not.toHaveProperty('cursor');
  });

  it('projects the next revision before notifying external-store subscribers', () => {
    const root = element();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const observed: string[] = [];
    orchestrator.subscribe(() => {
      observed.push(`${root.dataset.phoneRevision}:${root.dataset.phoneCursor}`);
    });

    orchestrator.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: orchestrator.getSnapshot().authorityId,
      scene: 'services'
    });

    expect(observed).toEqual(['1:transition:entry:0']);
    expect(orchestrator.getSnapshot()).toMatchObject({
      revision: 1,
      status: 'transaction',
      session: {
        operation: {
          trigger: 'auto',
          run: null,
          from: 'brand',
          to: 'services'
        },
        phase: 'verifying-target'
      },
      projection: {
        commitState: 'candidate',
        edge: 'brand'
      }
    });
  });

  it('[Pattern↔StarMap reduced cutover] binds the target leaf without entering direct-entry preparation', () => {
    const root = element();
    const star = element();
    const directPreparation = vi.fn();
    let boundToken: PresentationToken | null = null;
    let reportLeafFrame: ((frame: PhoneRenderedPresentationFrame) => void) | null = null;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'pattern',
      root,
      scrollY: () => 200,
      scrollTo: () => undefined
    });
    orchestrator.registerScrollCorridor({
      id: 'front-rail',
      scenes: ['pattern', 'star-map'],
      sample: () => null,
      boundary: () => null,
      landing: () => 200
    });
    orchestrator.registerSurface({
      id: 'front:star-map',
      scene: 'star-map',
      kind: 'fixed',
      root: () => star,
      coverageRoot: () => root,
      presentation: () => [true, true, true, true, 'static-poster'],
      adapter: {
        present(token, report) {
          boundToken = token;
          reportLeafFrame = report;
        }
      },
      prepareDirectEntry: directPreparation
    });

    orchestrator.dispatch({
      type: 'SCROLL_SAMPLED',
      authorityId: orchestrator.getSnapshot().authorityId,
      actualY: 200,
      corridor: 'front-rail',
      scene: 'star-map',
      progress: .61,
      direction: 1,
      reducedMotion: true
    } as never);

    const candidate = orchestrator.getSnapshot();
    if (candidate.status !== 'transaction') {
      throw new Error('Expected a reduced front candidate');
    }
    expect(candidate).toMatchObject({
      session: { phase: 'preparing', reducedMotion: true },
      projection: { semanticScene: 'star-map', commitState: 'candidate' }
    });
    expect(directPreparation).not.toHaveBeenCalled();
    expect(boundToken).not.toBeNull();
    expect(reportLeafFrame).not.toBeNull();
    const emitLeafFrame = reportLeafFrame as ((frame: PhoneRenderedPresentationFrame) => void) | null;
    if (!emitLeafFrame || !boundToken) {
      throw new Error('Expected the target leaf to retain the exact reduced admission token');
    }

    emitLeafFrame({
      token: boundToken,
      frameSequence: 1,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'star-map',
      session: null,
      projection: { commitState: 'stable' }
    });
  });

  it('registers surfaces as pure handles and lets the projector select roles', () => {
    const root = element();
    const brand = element();
    const services = element();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerSurface({
      id: 'native:brand',
      scene: 'brand',
      kind: 'native',
      root: () => brand,
      presentation: () => [true, true, true, true, 'static-poster']
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services,
      presentation: () => [true, true, true, true, 'static-poster']
    });

    expect(brand.dataset.phoneSurfaceRole).toBe('stable');
    expect(services.dataset.phoneSurfaceRole).toBe('retired');
    orchestrator.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: orchestrator.getSnapshot().authorityId,
      scene: 'services'
    });
    expect(brand.dataset.phoneSurfaceRole).toBe('retained-under-stage');
    expect(services.dataset.phoneSurfaceRole).toBe('candidate-stable');
  });

  it('[P0] admits a registered candidate before its target has committed visibility', () => {
    const root = element();
    const proof = element();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'figure2-animation',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerSurface({
      id: 'grade-a:proof',
      scene: 'figure2-proof',
      kind: 'native',
      root: () => proof,
      // This is the Figure2 → Proof candidate state in production: the root
      // exists, but its committed presentation is still inaccessible until
      // the candidate plane projects it. Admission must not depend on that
      // later committed fact.
      presentation: () => [true, false, false, false, null]
    });

    orchestrator.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: orchestrator.getSnapshot().authorityId,
      scene: 'figure2-proof'
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        operation: { from: 'figure2-animation', to: 'figure2-proof' },
        phase: 'verifying-target'
      },
      projection: {
        commitState: 'candidate',
        receiverSurface: 'grade-a:proof'
      }
    });
    expect(proof.dataset.phoneSurfaceRole).toBe('candidate-stable');
    expect(root.dataset.phoneStableScene).toBeUndefined();
  });

  it('[Task 3] obtains a static direct-entry proof through the presentation boundary', () => {
    const root = element();
    const authorityId = 'proof-runtime-authority';
    let actualY = 0;
    let scheduled: (() => void) | undefined;
    const basePresentation = createPhoneStoryPresentation({
      authorityId,
      scope: 'formal',
      root: () => root,
      schedulePresentationFrame(callback) {
        scheduled = callback;
        return () => { scheduled = undefined; };
      }
    });
    const observedTokens: unknown[] = [];
    const presentation = {
      ...basePresentation,
      activatePresentationAdapter(scene: Parameters<typeof basePresentation.activatePresentationAdapter>[0], token: Parameters<typeof basePresentation.activatePresentationAdapter>[1], report: Parameters<typeof basePresentation.activatePresentationAdapter>[2]) {
        observedTokens.push({ scene, token });
        return basePresentation.activatePresentationAdapter(scene, token, report);
      }
    };
    const orchestrator = createPhoneStoryOrchestrator({
      authorityId,
      initialScene: 'brand',
      root,
      presentation,
      scrollY: () => actualY,
      scrollTo: (target) => { actualY = target; }
    });
    registerCorridor(orchestrator);
    registerReadySurface(orchestrator, 'services');

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId,
      target: 'services',
      source: 'menu',
      fallbackScene: 'brand',
      cinematic: null
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-stable' }
    });
    expect(observedTokens).toContainEqual({
      scene: 'services',
      token: expect.objectContaining({
        authorityId,
        subject: 'native:services',
        kind: 'dom-reading'
      })
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-stable' }
    });
    scheduled?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services'
    });
  });

  it('[Education direct-entry cutover] binds one exact static token to the native Education leaf instead of using the generic post-paint fallback', () => {
    const root = element();
    const education = element();
    const authorityId = 'education-direct-authority';
    let actualY = 0;
    const frames: Array<() => void> = [];
    let genericFrames = 0;
    const bindings: Array<Readonly<{
      token: PresentationToken;
      report: (frame: PhoneRenderedPresentationFrame) => void;
    }>> = [];
    const presentation = createPhoneStoryPresentation({
      authorityId,
      scope: 'formal',
      root: () => root,
      schedulePresentationFrame(_callback) {
        genericFrames += 1;
        return () => undefined;
      }
    });
    const orchestrator = createPhoneStoryOrchestrator({
      authorityId,
      initialScene: 'lab',
      root,
      presentation,
      scrollY: () => actualY,
      scrollTo: (target) => { actualY = target; },
      scheduleFrame: (callback) => { frames.push(callback); }
    });
    registerCorridor(orchestrator, 'lab-education', 240);
    orchestrator.registerSurface({
      id: 'native:education',
      scene: 'education',
      kind: 'native',
      root: () => education,
      presentation: () => [true, true, true, true, 'static-poster'],
      adapter: {
        present(token, report) {
          bindings.push({ token, report });
        }
      }
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId,
      target: 'education',
      source: 'hash',
      fallbackScene: 'lab',
      cinematic: null
    });

    while (frames.length > 0) frames.shift()?.();

    const exact = bindings.at(0);
    if (!exact) throw new Error('Expected an Education leaf binding');
    expect(exact.token).toMatchObject({
      authorityId,
      subject: 'native:education',
      kind: 'static-poster'
    });
    expect(genericFrames).toBe(0);
    exact.report({
      token: exact.token,
      frameSequence: 1,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'education',
      session: null
    });
  });

  it('retires the terminal media source before target verification', () => {
    const root = element();
    const services = element();
    let session: PhoneOrchestratedRunSession | undefined;
    let verifyingTarget = false;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    registerCorridor(orchestrator);
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services,
      presentation: () => [
        true,
        !verifyingTarget,
        !verifyingTarget,
        !verifyingTarget,
        null
      ],
      adapter: { present() {} }
    });

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    if (session) reportSegmentProof(session, 'brand-figure3');
    session?.reportEndpointCommit('receiver');
    if (session) reportSegmentProof(session, 'figure3-services');
    verifyingTarget = true;
    session?.reportAnimationComplete();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' }
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      projection: {
        commitState: 'candidate',
        sourceSurface: null,
        receiverSurface: 'native:services',
        semanticScene: 'services'
      }
    });
    expect(root.dataset.phoneProjectionState).toBe('candidate');
    expect(root.dataset.phoneInputState).toBe('locked');
  });

  it('[R5] commits an exact first-frame projection before its dormant receiver catches up', () => {
    const root = element();
    const figure3 = element();
    const services = element();
    let servicesVisible = false;
    let session: PhoneOrchestratedRunSession | undefined;
    const presentation = createPhoneStoryPresentation({
      authorityId: 'first-frame-handoff-authority',
      scope: 'formal',
      root: () => root
    });
    const orchestrator = createPhoneStoryOrchestrator({
      authorityId: 'first-frame-handoff-authority',
      initialScene: 'brand',
      root,
      presentation,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerSurface({
      id: 'group45:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => figure3,
      // The source is deliberately interaction-inert during a source-led
      // packed-canvas handoff. It remains a painted physical frame.
      presentation: () => [true, !figure3.inert, true, false, null]
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services,
      // React activates this receiver after the atomic animating projection
      // has notified the external-store subscriber.
      presentation: () => [true, servicesVisible, true, false, null]
    });
    orchestrator.registerRunCapability('brand-services', 'handoff', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));

    orchestrator.dispatch({
      type: 'RUN_STARTED',
      authorityId: 'first-frame-handoff-authority',
      sessionId: 'first-frame-handoff-session',
      generation: 1,
      leg: 1,
      legIndex: 1,
      direction: 1,
      run: 'brand-services',
      anchorY: 100,
      inputEpoch: 1
    });

    if (!session) throw new Error('Expected the Figure3 → Services capability');
    figure3.inert = true;
    reportSegmentProof(session, 'figure3-services');

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'animating',
        operation: { legIndex: 1 }
      }
    });
    expect(root.dataset.phoneTransitionPhase).toBe('animating');

    // The declared Figure3 → Services media handoff intentionally keeps the
    // reading receiver at zero opacity until its late dissolve cue. A normal
    // diagnostic reapply must keep the source-led transaction alive.
    orchestrator.syncDiagnostics();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'animating', operation: { legIndex: 1 } }
    });

    servicesVisible = true;
    orchestrator.syncDiagnostics();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'animating', operation: { legIndex: 1 } }
    });
  });

  it('releases geometry before stable publication and resources after it', () => {
    const root = element();
    const frames: Array<() => void> = [];
    const events: string[] = [];
    let actualY = 0;
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => { actualY = nextY; },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    registerCorridor(orchestrator);
    registerReadySurface(orchestrator, 'services');
    orchestrator.subscribe(() => {
      if (orchestrator.getSnapshot().status === 'stable') {
        events.push(`stable:${root.dataset.phoneInputState}`);
      }
    });

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    if (session) reportSegmentProof(session, 'brand-figure3');
    session?.reportEndpointCommit('receiver');
    if (session) reportSegmentProof(session, 'figure3-services');
    session?.provideRelease({
      releaseGeometry: () => events.push('geometry'),
      releaseResources: () => events.push('resources')
    });
    session?.reportEndpointCommit('receiver');
    session?.reportTargetPresented();

    expect(events).toEqual(['geometry']);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing' }
    });
    frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'aligning-scroll' }
    });
    frames.shift()?.();
    expect(events).toEqual(['geometry', 'stable:free']);
    frames.shift()?.();
    expect(events).toEqual(['geometry', 'stable:free', 'resources']);
  });

  it('returns a failed run through the same source candidate precommit pipeline', () => {
    const root = element();
    const frames: Array<() => void> = [];
    let actualY = 0;
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => { actualY = nextY; },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    registerCorridor(orchestrator);
    registerReadySurface(orchestrator, 'brand', (callback) => frames.push(callback));

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    session?.reportFailure();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'rollback-measuring-landing' },
      projection: { commitState: 'candidate', semanticScene: 'brand' }
    });
    expect(root.dataset.phoneInputState).toBe('locked');
    frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'rollback-aligning-scroll' }
    });
    while (frames.length > 0) frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand',
      session: null,
      diagnostics: { lastRollback: { reason: 'capability-failed' } }
    });
    expect(root.dataset.phoneInputState).toBe('free');
  });

  it('[Group45 reduced cutover] expires static admission through the machine, then admits the next input', async () => {
    vi.useFakeTimers();
    try {
      const root = element();
      const frames: Array<() => void> = [];
      let actualY = 0;
      let session: PhoneOrchestratedRunSession | undefined;
      let starts = 0;
      const orchestrator = createPhoneStoryOrchestrator({
        initialScene: 'brand',
        root,
        scrollY: () => actualY,
        scrollTo: (nextY) => { actualY = nextY; },
        scheduleFrame: (callback) => frames.push(callback)
      });
      orchestrator.registerRunCapability('brand-services', 'reduced-timeout', {
        reducedMotion: true,
        position: () => 100,
        canStart: () => true,
        start: (_direction, activeSession) => {
          starts += 1;
          session = activeSession;
        }
      });
      registerCorridor(orchestrator);
      registerReadySurface(orchestrator, 'brand', (callback) => frames.push(callback));

      expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        session: { phase: 'preparing', reducedMotion: true }
      });
      session?.reportProgress(.5);
      session?.reportAnimationComplete();
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        session: { phase: 'preparing', progress: 0 }
      });

      await vi.advanceTimersByTimeAsync(PHONE_REDUCED_ADMISSION_TIMEOUT_MS);
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        diagnostics: { lastRollback: { reason: 'reduced-proof-timeout' } },
        session: { phase: 'rollback-measuring-landing' }
      });
      while (frames.length > 0) frames.shift()?.();
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'stable',
        scene: 'brand',
        session: null
      });
      expect(root.dataset.phoneInputState).toBe('free');

      expect(orchestrator.resolveIntent([2, 1, actualY, actualY + 240]))
        .toBe('claim-boundary');
      expect(starts).toBe(2);
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        session: { phase: 'preparing', reducedMotion: true }
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('[Group45 reduced cutover] lets only the live candidate request target layout through the route runtime', () => {
    const root = element();
    const frames: Array<() => void> = [];
    const commands: number[] = [];
    let actualY = 0;
    const sessions: PhoneOrchestratedRunSession[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    try {
      orchestrator.registerRunCapability('brand-services', 'reduced-layout', {
        reducedMotion: true,
        position: () => 100,
        canStart: () => true,
        start: (_direction, activeSession) => {
          sessions.push(activeSession);
        }
      });
      registerCorridor(orchestrator);
      registerReadySurface(orchestrator, 'brand', (callback) => frames.push(callback));

      expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
      const first = sessions.at(0);
      if (!first) throw new Error('Expected the first reduced candidate session');

      expect(first.requestReducedTargetLayout(240)).toBe(true);
      expect(commands).toEqual([240]);
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        projection: { commitState: 'candidate' },
        session: { phase: 'preparing', reducedMotion: true }
      });
      expect(root.dataset.phoneInputState).toBe('locked');

      first.reportFailure();
      while (frames.length > 0) frames.shift()?.();
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'stable',
        scene: 'brand',
        session: null
      });

      expect(orchestrator.resolveIntent([2, 1, actualY, actualY + 240]))
        .toBe('claim-boundary');
      const second = sessions.at(1);
      if (!second) throw new Error('Expected the second reduced candidate session');
      const commandCount = commands.length;
      expect(first.requestReducedTargetLayout(280)).toBe(false);
      expect(commands).toHaveLength(commandCount);
      expect(second.requestReducedTargetLayout(260)).toBe(true);
      expect(commands.at(-1)).toBe(260);
    } finally {
      orchestrator.dispose();
    }
  });

  it('uses at most one bounded scroll correction before a stable target hold', () => {
    const root = element();
    const frames: Array<() => void> = [];
    const commands: number[] = [];
    let actualY = 0;
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        if (commands.length >= 2) actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    registerCorridor(orchestrator);
    registerReadySurface(orchestrator, 'services');

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    if (session) reportSegmentProof(session, 'brand-figure3');
    session?.reportEndpointCommit('receiver');
    if (session) reportSegmentProof(session, 'figure3-services');
    session?.reportEndpointCommit('receiver');
    session?.reportTargetPresented();
    frames.shift()?.();
    frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { alignment: { correctionCount: 1 } }
    });
    frames.shift()?.();

    // The boundary claim no longer performs an eager scroll command. The two
    // commands are the transaction-owned alignment and its single correction.
    expect(commands).toHaveLength(2);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services'
    });
  });

  it('aligns an authored Grade A reverse settle to the Method target marker', () => {
    const root = element();
    const frames: Array<() => void> = [];
    const commands: number[] = [];
    let actualY = 5_042;
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'figure2-animation',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('method-figure2', 'test', capability(5_886, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    orchestrator.registerScrollCorridor({
      id: 'method-grade-a',
      scenes: ['method-top', 'figure2-animation'],
      sample: () => null,
      boundary: () => 5_886,
      landing: (scene) => scene === 'method-top' ? 4_051 : 5_042
    });
    registerReadySurface(orchestrator, 'method-top');

    expect(orchestrator.resolveIntent([
      1,
      -1,
      actualY,
      actualY - 100
    ])).toBe('claim-boundary');
    if (session) reportSegmentProof(session, 'method-bottom-figure2');
    session?.provideRelease({
      releaseGeometry: () => undefined,
      releaseResources: () => undefined
    });
    session?.reportEndpointCommit('receiver');
    session?.reportTargetPresented();
    frames.shift()?.();
    frames.shift()?.();

    expect(commands).toEqual([4_051]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'method-top',
      scroll: { actualY: 4_051 }
    });
  });

  it('[normal terminal admission hard cutover] retains one terminal completion until its manifest receiver re-registers', () => {
    const root = element();
    const figure2 = element();
    const method = element();
    let session: PhoneOrchestratedRunSession | undefined;
    let starts = 0;
    let targetToken: PresentationToken | null = null;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'figure2-animation',
      root,
      scrollY: () => 5_042,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability('method-figure2', 'test', capability(5_886, (
      _direction,
      activeSession
    ) => {
      starts += 1;
      session = activeSession;
    }));
    orchestrator.registerScrollCorridor({
      id: 'method-grade-a',
      scenes: ['method-top', 'figure2-animation'],
      sample: () => null,
      boundary: () => 5_886,
      landing: () => 5_042
    });
    orchestrator.registerSurface({
      id: 'grade-a:figure2',
      scene: 'figure2-animation',
      kind: 'fixed',
      root: () => figure2,
      presentation: () => [true, true, true, true, 'static-poster']
    });

    expect(orchestrator.resolveIntent([1, -1, 5_042, 4_942]))
      .toBe('claim-boundary');
    if (session) reportSegmentProof(session, 'method-bottom-figure2');
    session?.reportEndpointCommit('receiver');

    // The old leaf completion is retained by the authority, but no candidate
    // may publish while `native:method` is absent. It must neither roll back
    // nor restart the cinematic leg while React is rebinding that receiver.
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'animating',
        operation: { run: 'method-figure2', direction: -1 }
      },
      projection: { commitState: 'transition' }
    });
    expect(starts).toBe(1);

    orchestrator.registerSurface({
      id: 'native:method',
      scene: 'method-top',
      kind: 'native',
      root: () => method,
      // A re-bound logical source stays dormant until candidate projection
      // promotes it to the terminal target plane.
      presentation: () => [true, false, false, false, null],
      adapter: {
        present(token) {
          targetToken = token;
        }
      }
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' },
      projection: {
        commitState: 'candidate',
        receiverSurface: 'native:method'
      }
    });
    expect(targetToken).toMatchObject({
      subject: 'native:method',
      kind: phoneScenePresentationProofKind('method-top')
    });
    expect(starts).toBe(1);
  });

  it('[normal terminal admission hard cutover] rolls back when its receiver never re-registers', async () => {
    vi.useFakeTimers();
    try {
      const root = element();
      const figure2 = element();
      const frames: Array<() => void> = [];
      let session: PhoneOrchestratedRunSession | undefined;
      const orchestrator = createPhoneStoryOrchestrator({
        initialScene: 'figure2-animation',
        root,
        scrollY: () => 5_042,
        scrollTo: () => undefined,
        scheduleFrame: (callback) => frames.push(callback)
      });
      orchestrator.registerRunCapability('method-figure2', 'terminal-timeout', capability(5_886, (
        _direction,
        activeSession
      ) => {
        session = activeSession;
      }));
      orchestrator.registerScrollCorridor({
        id: 'method-grade-a',
        scenes: ['method-top', 'figure2-animation'],
        sample: () => null,
        boundary: () => 5_886,
        landing: () => 5_042
      });
      orchestrator.registerSurface({
        id: 'grade-a:figure2',
        scene: 'figure2-animation',
        kind: 'fixed',
        root: () => figure2,
        presentation: () => [true, true, true, true, 'static-poster']
      });

      expect(orchestrator.resolveIntent([1, -1, 5_042, 4_942]))
        .toBe('claim-boundary');
      if (session) reportSegmentProof(session, 'method-bottom-figure2');
      session?.reportEndpointCommit('receiver');
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        session: { phase: 'animating' }
      });

      // The engine may defer exactly one completion during a React rebind,
      // but a leaf that never returns must release the lock through the same
      // machine rollback path rather than leave the authority at progress 0.
      await vi.runAllTimersAsync();
      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        diagnostics: {
          lastRollback: { reason: 'target-verification-failed' }
        },
        session: { phase: 'rollback-measuring-landing' }
      });
      expect(root.dataset.phoneInputState).toBe('locked');
      while (frames.length > 0) frames.shift()?.();
      expect(orchestrator.getSnapshot()).not.toMatchObject({
        status: 'transaction',
        session: { phase: 'animating' }
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('claims a direct Contact reverse input at the canonical Group67 boundary', () => {
    const canonicalBoundary = 6_435.6875;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'contact',
      scrollY: () => canonicalBoundary + 1,
      scrollTo: () => undefined
    });
    orchestrator.registerScrollCorridor({
      id: 'group67-direct-contact',
      scenes: ['education', 'crane-animation', 'contact'],
      sample: () => null,
      boundary: (run) => run === 'education-contact'
        ? canonicalBoundary
        : null,
      landing: (scene) => scene === 'contact' ? canonicalBoundary : null
    });

    expect(orchestrator.resolveIntent([
      1,
      -1,
      canonicalBoundary + 1,
      canonicalBoundary - 120
    ])).toBe('claim-boundary');
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        operation: {
          run: 'education-contact',
          from: 'contact',
          to: 'education',
          direction: -1
        },
        anchor: { y: canonicalBoundary }
      }
    });
  });

  it('[Method↔AOD admission lifetime] keeps the front reverse boundary through a sibling corridor remount', () => {
    const methodBoundary = 3_162;
    let starts = 0;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'method-top',
      scrollY: () => methodBoundary + 1,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability('aod-method', 'aod:method', capability(
      methodBoundary,
      () => {
        starts += 1;
      }
    ));
    const frontLease = orchestrator.registerScrollCorridor({
      id: 'front-rail',
      scenes: ['hero', 'pattern', 'star-map', 'aod-animation'],
      sample: () => null,
      boundary: (run, direction) => (
        run === 'aod-method' && direction === -1 ? methodBoundary : null
      ),
      landing: () => methodBoundary
    });
    const firstGradeALease = orchestrator.registerScrollCorridor({
      id: 'method-grade-a',
      scenes: ['method-top', 'figure2-animation', 'figure2-proof'],
      sample: () => null,
      boundary: () => null,
      landing: () => methodBoundary
    });

    // Grade A can remount a renderer while Method is the stable selected
    // corridor. The independent front admission lease must remain available.
    firstGradeALease.dispose();
    orchestrator.registerScrollCorridor({
      id: 'method-grade-a',
      scenes: ['method-top', 'figure2-animation', 'figure2-proof'],
      sample: () => null,
      boundary: () => null,
      landing: () => methodBoundary
    });

    expect(orchestrator.resolveIntent([
      1,
      -1,
      methodBoundary + 1,
      methodBoundary - 249
    ])).toBe('claim-boundary');
    expect(starts).toBe(1);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        operation: {
          run: 'aod-method',
          direction: -1,
          from: 'method-top',
          to: 'aod-animation'
        }
      }
    });
    frontLease.dispose();
  });

  it('[AOD first-intent cutover] claims the stable AOD semantic edge before native scroll can drift', () => {
    const aodBoundary = 1_920;
    let starts = 0;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'aod-animation',
      scrollY: () => aodBoundary,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability('aod-method', 'aod:method', capability(
      aodBoundary,
      () => { starts += 1; }
    ));
    orchestrator.registerScrollCorridor({
      id: 'front-aod-first-intent',
      scenes: ['hero', 'pattern', 'star-map', 'aod-animation'],
      sample: () => null,
      boundary: (run, direction) => (
        run === 'aod-method' && direction === 1 ? aodBoundary : null
      ),
      landing: () => aodBoundary
    });

    expect(orchestrator.resolveIntent([
      1,
      1,
      aodBoundary,
      aodBoundary + 50
    ])).toBe('claim-boundary');
    expect(starts).toBe(1);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'preparing',
        inputEpoch: 1,
        operation: { run: 'aod-method', direction: 1 },
        aod: { stage: 'admission' }
      }
    });

    expect(orchestrator.resolveIntent([
      1,
      1,
      aodBoundary,
      aodBoundary + 100
    ])).toBe('block-active-session');
    expect(starts).toBe(1);
  });

  it('does not publish a next snapshot when a connected root disconnects during preflight', () => {
    const root = Object.assign(element(), { isConnected: true });
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const observed = vi.fn();
    orchestrator.subscribe(observed);
    root.isConnected = false;

    orchestrator.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: orchestrator.getSnapshot().authorityId,
      scene: 'services'
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand',
      revision: 0
    });
    expect(observed).not.toHaveBeenCalled();
  });

  it('[direct admission hard cutover] holds a direct request until its manifest receiver registers', () => {
    const root = element();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'hero',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'method-top',
      source: 'initial',
      fallbackScene: 'hero',
      cinematic: null
    });

    // A lazy target cannot be published as a candidate merely because the
    // bootstrap source exists. The pending direct intent replays only once
    // the manifest receiver has an actual registered leaf.
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'hero',
      revision: 0
    });

    orchestrator.registerSurface({
      id: 'native:method',
      scene: 'method-top',
      kind: 'native',
      root: () => root,
      presentation: () => [true, true, true, true, 'static-poster']
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'verifying-target',
        operation: {
          trigger: 'entry',
          run: null,
          from: 'hero',
          to: 'method-top'
        }
      },
      projection: { semanticScene: 'method-top', commitState: 'candidate' }
    });
  });

  it('replays a stable direct entry after its route root becomes projectable', () => {
    const routeRoot = Object.assign(element(), { isConnected: false });
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'hero',
      root: routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'method-top',
      source: 'initial',
      fallbackScene: 'hero',
      cinematic: null
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'hero'
    });

    routeRoot.isConnected = true;
    orchestrator.syncDiagnostics();

    // Restoring the route root alone is still not sufficient: direct
    // admission waits for the manifest receiver rather than publishing a
    // target candidate into an incomplete lazy graph.
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'hero'
    });
    orchestrator.registerSurface({
      id: 'native:method',
      scene: 'method-top',
      kind: 'native',
      root: () => routeRoot,
      presentation: () => [true, true, true, true, 'static-poster']
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'verifying-target',
        operation: { run: null, legIndex: 0, to: 'method-top' }
      }
    });
  });

  it('[R5] keeps a visual direct entry in verification until its registered receiver presents a frame', async () => {
    const root = element();
    const frames: Array<() => void> = [];
    const commands: number[] = [];
    let actualY = 0;
    let framePresented = false;
    let publishFrame: (() => void) | undefined;
    let resolvePreparation: () => void = () => undefined;
    const preparation = new Promise<void>((resolve) => {
      resolvePreparation = () => {
        framePresented = true;
        resolve();
      };
    });
    const requestedScenes: string[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerScrollCorridor({
      id: 'direct-figure3',
      scenes: ['brand', 'figure3-animation', 'services'],
      sample: () => null,
      boundary: () => 320,
      landing: (scene) => scene === 'figure3-animation' ? 420 : null
    });
    orchestrator.registerSurface({
      id: 'group45:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => element(),
      presentation: () => [
        true,
        true,
        true,
        framePresented,
        framePresented ? 'packed-canvas-frame' : null
      ],
      adapter: {
        present(token, report) {
          publishFrame = () => report({
            token,
            frameSequence: 1,
            observedAt: performance.now()
          });
        }
      },
      prepareDirectEntry: ({ scene }) => {
        requestedScenes.push(scene);
        return preparation;
      }
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'figure3-animation',
      source: 'hash',
      fallbackScene: 'brand',
      cinematic: null
    });

    expect(requestedScenes).toEqual(['figure3-animation']);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' }
    });

    resolvePreparation();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing' }
    });
    while (frames.length > 0) frames.shift()?.();
    expect(commands).toEqual([420]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-stable' }
    });
    publishFrame?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'figure3-animation',
      session: null
    });
  });

  it('waits for a matching late capability without reviving an old stable input', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    registerCorridor(orchestrator);

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'preparing', inputEpoch: 1 }
    });

    let session: PhoneOrchestratedRunSession | undefined;
    orchestrator.registerRunCapability('brand-services', 'late', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));

    expect(session).toMatchObject({
      sessionId: expect.any(String),
      generation: expect.any(Number),
      leg: 0,
      direction: 1
    });
  });

  it('does not replay an unclaimed input when a corridor appears later', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    let starts = 0;
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, () => {
      starts += 1;
    }));

    expect(orchestrator.resolveIntent(intent())).toBe('pass-native');
    registerCorridor(orchestrator);

    expect(starts).toBe(0);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand'
    });
  });

  it('uses the same alignment transaction for a stable direct entry after its corridor is ready', () => {
    const frames: Array<() => void> = [];
    let actualY = 0;
    const commands: number[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => element(),
      presentation: () => [true, true, true, true, 'static-poster']
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'services',
      source: 'menu',
      fallbackScene: 'brand',
      cinematic: null
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' },
      projection: { semanticScene: 'services', commitState: 'candidate' }
    });
    expect(commands).toEqual([]);

    orchestrator.registerScrollCorridor({
      id: 'direct-services',
      scenes: ['brand', 'services'],
      sample: () => null,
      boundary: () => 100,
      landing: (scene) => scene === 'services' ? 220 : 0
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing' }
    });
    frames.shift()?.();
    frames.shift()?.();

    expect(commands).toEqual([220]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it('[R5] keeps reading direct-entry content uncommitted until it is visible after alignment', () => {
    const frames: Array<() => void> = [];
    let actualY = 0;
    let contentVisible = false;
    const commands: number[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerScrollCorridor({
      id: 'direct-services-post-scroll-content',
      scenes: ['brand', 'services'],
      sample: () => null,
      boundary: () => 100,
      landing: (scene) => scene === 'services' ? 220 : null
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => element(),
      presentation: () => [
        true,
        true,
        true,
        contentVisible,
        contentVisible ? 'static-poster' : null
      ]
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'services',
      source: 'history',
      fallbackScene: 'brand',
      cinematic: null
    });
    const directSnapshot = orchestrator.getSnapshot();
    const sessionId = directSnapshot.status === 'transaction'
      ? directSnapshot.session.sessionId
      : null;

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing', sessionId }
    });
    frames.shift()?.();
    frames.shift()?.();

    expect(commands).toEqual([220]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-stable', sessionId }
    });

    contentVisible = true;
    orchestrator.syncDiagnostics();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it('[direct admission] aligns an offscreen target before requesting its leaf proof', () => {
    const frames: Array<() => void> = [];
    let actualY = 0;
    let targetVisible = false;
    const commands: number[] = [];
    const presented: Array<Readonly<{
      token: PresentationToken;
      report: (frame: PhoneRenderedPresentationFrame) => void;
    }>> = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
        targetVisible = true;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerScrollCorridor({
      id: 'direct-services-offscreen-proof',
      scenes: ['brand', 'services'],
      sample: () => null,
      boundary: () => 100,
      landing: (scene) => scene === 'services' ? 220 : null
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => element(),
      presentation: () => [
        true,
        targetVisible,
        targetVisible,
        targetVisible,
        targetVisible ? 'static-poster' : null
      ],
      adapter: {
        present(token, report) {
          presented.push({ token, report });
        }
      }
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'services',
      source: 'initial',
      fallbackScene: 'brand',
      cinematic: null
    });

    expect(presented).toEqual([]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing' }
    });
    frames.shift()?.();
    expect(commands).toEqual([220]);
    expect(presented).toEqual([]);
    frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-stable' }
    });
    expect(presented).toHaveLength(1);

    const target = presented[0];
    if (!target) throw new Error('Expected target leaf proof binding');
    target.report({
      token: target.token,
      frameSequence: 1,
      observedAt: 1,
      origin: 'leaf-static-poster'
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it('retries a direct entry when route geometry becomes ready after its candidate frame', () => {
    const frames: Array<() => void> = [];
    let actualY = 0;
    let landingReady = false;
    const commands: number[] = [];
    const root = element();
    const services = element();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });

    orchestrator.registerScrollCorridor({
      id: 'direct-services-delayed-geometry',
      scenes: ['brand', 'services'],
      sample: () => null,
      boundary: () => 100,
      landing: (scene) => (
        landingReady && scene === 'services' ? 220 : null
      )
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services,
      presentation: () => [true, true, true, true, 'static-poster']
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'services',
      source: 'initial',
      fallbackScene: 'brand',
      cinematic: null
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' }
    });

    landingReady = true;
    orchestrator.syncDiagnostics();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing' }
    });
    frames.shift()?.();
    frames.shift()?.();

    expect(commands).toEqual([220]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it.each(['hash', 'menu', 'history'] as const)(
    'normalizes %s navigation into the same direct-entry transaction',
    (source) => {
      const orchestrator = createPhoneStoryOrchestrator({
        initialScene: 'brand',
        scrollY: () => 0,
        scrollTo: () => undefined
      });
      orchestrator.registerSurface({
        id: 'native:services',
        scene: 'services',
        kind: 'native',
        root: () => element(),
        presentation: () => [true, true, true, true, 'static-poster']
      });

      orchestrator.dispatch({
        type: 'NAVIGATE_REQUESTED',
        authorityId: orchestrator.getSnapshot().authorityId,
        scene: 'services',
        source
      });

      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        session: {
          operation: {
            trigger: 'entry',
            run: null,
            direction: 1,
            from: 'brand',
            to: 'services'
          }
        }
      });
    }
  );
});
