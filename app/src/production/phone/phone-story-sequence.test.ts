import { describe, expect, it } from 'vitest';
import {
  createPhoneStoryRuntimeEngine as createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession
} from './phone-story/runtime/engine';
import { resolvePhoneRunLanding } from './phone-run-landing';
import { phoneRun, phoneStoryRuns } from './phone-story-runs';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';
import {
  phoneScenePresentationTuple,
  phoneScenePresentationProofKind,
  phoneSegmentPresentationTuple
} from './phone-story/manifest';

function reportProof(
  session: PhoneOrchestratedRunSession,
  scene: Parameters<typeof phoneScenePresentationTuple>[0],
  kind: Parameters<PhoneOrchestratedRunSession['presentationProofToken']>[0],
  subject: string
): void {
  const token = session.presentationProofToken(kind, subject);
  if (!token) throw new Error('Expected an active presentation token');
  session.reportPresentationProof({
    token,
    frameSequence: 1,
    observedAt: 1,
    connected: true,
    visible: true,
    coverageComplete: true,
    edge: phoneScenePresentationTuple(scene)[1]
  });
}

function intent(inputEpoch: number, direction: PhoneTransitionDirection) {
  return [
    inputEpoch,
    direction,
    direction === 1 ? 0 : 300,
    direction === 1 ? 300 : 0
  ] as const;
}

/** Every direct or terminal admission begins only after its leaf has mounted. */
function registerDirectReceiver(
  orchestrator: ReturnType<typeof createPhoneStoryOrchestrator>,
  scene: Parameters<typeof phoneScenePresentationTuple>[0]
): void {
  const receiver = phoneScenePresentationTuple(scene)[4];
  orchestrator.registerSurface({
    id: receiver,
    scene,
    kind: receiver.startsWith('native:') ? 'native' : 'fixed',
    root: () => ({ dataset: {}, style: {} } as unknown as HTMLElement),
    presentation: () => [true, true, true, true, 'static-poster'],
    // Keep proof timing under this deterministic driver; registration itself
    // never manufactures the terminal proof.
    adapter: { present() {} }
  });
}

function reportCurrentLegFrame(
  orchestrator: ReturnType<typeof createPhoneStoryOrchestrator>,
  session: PhoneOrchestratedRunSession
): void {
  const snapshot = orchestrator.getSnapshot();
  if (snapshot.status !== 'transaction' || !snapshot.session.operation.run) {
    throw new Error('Expected an active cinematic leg');
  }
  const leg = phoneRun(snapshot.session.operation.run).legs[
    snapshot.session.operation.legIndex
  ];
  if (!leg) throw new Error('Expected an active run leg');
  reportProof(
    session,
    phoneSegmentPresentationTuple(leg.segment)[3],
    phoneSegmentPresentationTuple(leg.segment)[8],
    phoneSegmentPresentationTuple(leg.segment)[9]
  );
}

function reportCurrentTargetProof(
  orchestrator: ReturnType<typeof createPhoneStoryOrchestrator>,
  session: PhoneOrchestratedRunSession
): void {
  const snapshot = orchestrator.getSnapshot();
  if (snapshot.status !== 'transaction') {
    throw new Error('Expected a candidate target presentation');
  }
  const target = snapshot.session.operation.to;
  reportProof(
    session,
    target,
    phoneScenePresentationProofKind(target),
    phoneScenePresentationTuple(target)[4]
  );
}

describe('canonical phone story sequence', () => {
  it('runs the full forward and reverse story under one snapshot transaction contract', () => {
    const sessions: PhoneOrchestratedRunSession[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'aod-animation',
      scrollY: () => 100,
      scrollTo: () => undefined
    });
    for (const run of phoneStoryRuns) {
      orchestrator.registerRunCapability(run.id, `sequence:${run.id}`, {
        position: () => 100,
        canStart: () => true,
        start: (_direction, session) => {
          sessions.push(session);
        }
      });
    }
    orchestrator.registerScrollCorridor({
      id: 'sequence',
      scenes: phoneStoryRuns.flatMap((run) => [run.from, run.to]),
      sample: () => null,
      boundary: () => 100,
      landing: () => 100
    });
    for (const scene of new Set(phoneStoryRuns.flatMap((run) => [
      run.from,
      run.to
    ]))) {
      registerDirectReceiver(orchestrator, scene);
    }

    let epoch = 0;
    const drive = (direction: PhoneTransitionDirection) => {
      const runs = direction === 1 ? phoneStoryRuns : [...phoneStoryRuns].reverse();
      for (const run of runs) {
        const target = direction === 1 ? run.to : run.from;
        expect(orchestrator.resolveIntent(intent(++epoch, direction)))
          .toBe('claim-boundary');
        const session = sessions.at(-1);
        if (!session) throw new Error('Expected a phone transaction session');
        reportCurrentLegFrame(orchestrator, session);
        for (let index = 0; index < run.legs.length; index += 1) {
          session.reportEndpointCommit('receiver');
          if (index < run.legs.length - 1) {
            reportCurrentLegFrame(orchestrator, session);
          }
        }
        reportCurrentTargetProof(orchestrator, session);
        session.reportTargetPresented();
        session.reportPresentationCommitted();
        expect(orchestrator.getSnapshot()).toMatchObject({
          status: 'stable',
          scene: target,
          session: null
        });
      }
    };

    drive(1);
    drive(-1);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'aod-animation'
    });
  });

  it.each([
    ['figure3-animation', 'brand'],
    ['ttg-animation', 'services'],
    ['ph-animation', 'lab'],
    ['crane-animation', 'education']
  ] as const)('keeps direct %s entry on its canonical stable target', (
    scene,
    fallbackScene
  ) => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: scene,
      scrollY: () => 100,
      scrollTo: () => undefined
    });
    registerDirectReceiver(orchestrator, scene);

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: scene,
      source: 'initial',
      fallbackScene,
      cinematic: null
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'verifying-target',
        operation: {
          trigger: 'entry',
          run: null,
          from: fallbackScene,
          to: scene
        }
      },
      projection: { semanticScene: scene, commitState: 'candidate' }
    });
  });

  it('[Task 9] resolves every declared run-anchor policy through the one exhaustive resolver', () => {
    expect(new Set(phoneStoryRuns.map((run) => run.anchor))).toEqual(new Set([
      'aod-semantic-edge',
      'authored-boundary',
      'preserve-composite'
    ]));

    for (const definition of phoneStoryRuns) {
      expect(() => resolvePhoneRunLanding({
        policy: definition.anchor,
        direction: 1,
        reason: 'forward',
        currentY: 120,
        boundaryY: 160,
        targetY: 180,
        compositeY: 140
      })).not.toThrow();
    }
  });
});
