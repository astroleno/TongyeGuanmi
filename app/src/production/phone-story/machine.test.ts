import { describe, expect, it } from 'vitest';

import {
  createPhoneEvidenceSlot,
  createPhoneStoryBoot,
  reducePhoneStory,
  selectPhoneCheckpoint,
  selectPhoneEdgeSurface,
  selectPhoneNavigationScene,
  type PhoneMachineResult,
  type PhoneMachineSnapshot,
  type PhoneMachineTransactionSnapshot
} from './machine';
import {
  phoneEntryForLocation,
  phoneManifest,
  phoneSegmentBetween,
  phoneSceneById,
  type PhoneSceneId,
  type PhoneSegmentManifest
} from './manifest';
import { phoneEventPriority } from './runtime';
import {
  PHONE_FINAL_EVIDENCE_KINDS,
  type PhoneEvidenceKind,
  type PhoneEvidenceSlot,
  type PhoneStoryEvent
} from './protocol';

const viewport = {
  layout: { width: 390, height: 844, orientation: 'portrait' as const },
  visual: { offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1 },
  layoutRevision: 1,
  visualRevision: 1,
  supported: true
} as const;

function boot(scene: PhoneSceneId, authorityId = `authority:${scene}`): PhoneMachineResult {
  const entry = phoneEntryForLocation('/', phoneSceneById(scene).directEntry.canonicalHash);
  return createPhoneStoryBoot({
    authorityId,
    request: { pathname: '/', hash: entry.canonicalHash, origin: 'initial' },
    viewport
  });
}

function transaction(snapshot: PhoneMachineSnapshot): PhoneMachineTransactionSnapshot {
  expect(snapshot.status).toBe('transaction');
  if (snapshot.status !== 'transaction') throw new Error('expected transaction');
  return snapshot;
}

function dispatch(
  snapshot: PhoneMachineSnapshot,
  event: PhoneStoryEvent
): PhoneMachineResult {
  return reducePhoneStory(snapshot, event);
}

function reportSlot(
  snapshot: PhoneMachineSnapshot,
  slot: PhoneEvidenceSlot,
  suffix = ''
): PhoneMachineResult {
  return dispatch(snapshot, {
    type: 'evidence-reported',
    slot,
    report: {
      kind: slot.kind,
      token: `${slot.kind}:${slot.stageIndex}:${slot.leg}${suffix}`,
      accepted: true
    }
  });
}

function reportRequired(
  result: PhoneMachineResult,
  group: 'prepared' | 'final'
): PhoneMachineResult {
  let current = result;
  const slots = group === 'prepared'
    ? transaction(current.snapshot).transaction.requiredPrepared
    : transaction(current.snapshot).transaction.requiredFinal;
  for (const slot of slots) current = reportSlot(current.snapshot, slot);
  return current;
}

function prove(result: PhoneMachineResult): PhoneMachineResult {
  const prepared = reportRequired(result, 'prepared');
  return reportRequired(prepared, 'final');
}

describe('phone story boot/direct-entry machine', () => {
  it('boots every canonical direct target under one complete evidence quorum', () => {
    for (const scene of phoneManifest.scenes) {
      const initial = boot(scene.id);
      const current = transaction(initial.snapshot);
      expect(current.transaction.mode).toBe('boot');
      expect(current.transaction.phase).toBe('preparing');
      expect(current.stableCommit).toBeNull();
      expect(current.presentationProof).toBeNull();
      expect(current.transaction.candidateSceneId).toBe(scene.id);
      expect(current.transaction.requiredPrepared.map(({ kind }) => kind)).toEqual(
        scene.directEntry.closure.exposeReceiverAfter
      );
      expect(initial.effects).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'load-dependencies',
          dependencies: scene.directEntry.closure.load
        })
      ]));

      const withheld = current.transaction.requiredPrepared.at(-1);
      if (!withheld) throw new Error(`${scene.id}: missing prepared requirements`);
      let partial = initial;
      for (const slot of current.transaction.requiredPrepared.slice(0, -1)) {
        partial = reportSlot(partial.snapshot, slot);
      }
      expect(transaction(partial.snapshot).transaction.phase).toBe('preparing');

      const prepared = reportSlot(partial.snapshot, withheld);
      expect(transaction(prepared.snapshot).transaction.phase).toBe('presenting-target');
      expect(prepared.effects).toContainEqual(expect.objectContaining({
        type: 'apply-presentation-plane'
      }));

      const stable = reportRequired(prepared, 'final').snapshot;
      expect(stable.status).toBe('stable');
      if (stable.status !== 'stable') throw new Error('expected stable');
      expect(stable.stableCommit).toEqual({
        sceneId: scene.id,
        landing: scene.landing,
        commitSequence: 1
      });
      expect(stable.presentationProof.commitSequence).toBe(1);
      expect(stable.presentationProof.planeRevision).toBe(1);
      expect(Object.isFrozen(stable)).toBe(true);
      expect(selectPhoneEdgeSurface(stable)).toBe(scene.edgeSurface);
      expect(selectPhoneCheckpoint(stable)).toBe(scene.checkpoint);
      expect(selectPhoneNavigationScene(stable)).toBe(scene.navigationId);
    }
  });

  it('ignores stale generations and wrong slots while allowing distinct legs on one attempt', () => {
    const initial = boot('hero');
    const current = transaction(initial.snapshot);
    const target = current.transaction.requiredPrepared[0];
    if (!target) throw new Error('missing target slot');
    const source = createPhoneEvidenceSlot({
      attempt: target.attempt,
      stageIndex: target.stageIndex + 1,
      leg: 'source',
      kind: target.kind,
      planeRevision: null
    });
    const effect = createPhoneEvidenceSlot({
      attempt: target.attempt,
      stageIndex: target.stageIndex + 2,
      leg: 'effect',
      kind: target.kind,
      planeRevision: null
    });
    expect(source.attempt).toBe(target.attempt);
    expect(effect.attempt).toBe(target.attempt);
    expect(source).not.toEqual(effect);

    const stale = {
      ...target,
      attempt: {
        ...target.attempt,
        transactionGeneration: target.attempt.transactionGeneration + 1
      }
    };
    const staleResult = reportSlot(initial.snapshot, stale);
    expect(staleResult.snapshot).toBe(initial.snapshot);
    expect(staleResult.effects).toEqual([]);

    const wrong = reportSlot(initial.snapshot, source);
    expect(wrong.snapshot).toBe(initial.snapshot);
    expect(wrong.effects).toEqual([]);
  });

  it('normalizes unknown direct hashes and bounds Hero fallback/fault/retry generations', () => {
    const unknown = createPhoneStoryBoot({
      authorityId: 'authority:unknown',
      request: { pathname: '/', hash: '#does-not-exist', origin: 'hash' },
      viewport
    });
    expect(transaction(unknown.snapshot).transaction.candidateSceneId).toBe('hero');
    const normalized = prove(unknown);
    expect(normalized.effects).toContainEqual({
      type: 'replace-url',
      pathname: '/',
      hash: '#home'
    });

    const failedTarget = boot('crane-animation', 'authority:fallback');
    const targetTransaction = transaction(failedTarget.snapshot).transaction;
    const failure = dispatch(failedTarget.snapshot, {
      type: 'failure-reported',
      slot: targetTransaction.requiredPrepared[0]!,
      failure: { code: 'module', message: 'rejected', recoverable: true }
    });
    const fallback = transaction(failure.snapshot);
    expect(fallback.transaction.mode).toBe('boot');
    expect(fallback.transaction.candidateSceneId).toBe('hero');
    expect(fallback.transaction.attempt.transactionGeneration).toBe(2);

    const heroFailure = dispatch(fallback, {
      type: 'failure-reported',
      slot: fallback.transaction.requiredPrepared[0]!,
      failure: { code: 'frame', message: 'no safe frame', recoverable: false }
    });
    expect(heroFailure.snapshot.status).toBe('faulted');
    if (heroFailure.snapshot.status !== 'faulted') throw new Error('expected fault');
    expect(heroFailure.snapshot.safeCover).toEqual({ kind: 'loader', opaque: true });

    const retry = dispatch(heroFailure.snapshot, { type: 'retry-requested' });
    expect(transaction(retry.snapshot).transaction.attempt.transactionGeneration).toBe(3);
    expect(transaction(retry.snapshot).transaction.candidateSceneId).toBe('hero');
  });
});

describe('phone warm entry machine', () => {
  it('preserves anchors across all ordered warm entries and commits each target once', () => {
    for (const source of phoneManifest.scenes) {
      const sourceResult = prove(boot(source.id, `authority:${source.id}`));
      if (sourceResult.snapshot.status !== 'stable') throw new Error('source did not settle');
      const sourceCommit = sourceResult.snapshot.stableCommit;
      const sourceProof = sourceResult.snapshot.presentationProof;
      for (const target of phoneManifest.scenes) {
        if (source.id === target.id) continue;
        for (const origin of ['menu', 'programmatic', 'popstate'] as const) {
          const entry = dispatch(sourceResult.snapshot, {
            type: 'entry-requested',
            request: {
              pathname: '/',
              hash: target.directEntry.canonicalHash,
              origin
            }
          });
          const entering = transaction(entry.snapshot);
          expect(entering.transaction.mode).toBe('entry');
          expect(entering.stableCommit).toBe(sourceCommit);
          expect(entering.presentationProof).toBe(sourceProof);
          expect(entering.transaction.candidateSceneId).toBe(target.id);

          const settled = prove(entry);
          expect(settled.snapshot.status).toBe('stable');
          if (settled.snapshot.status !== 'stable') throw new Error('target did not settle');
          expect(settled.snapshot.stableCommit.sceneId).toBe(target.id);
          expect(settled.snapshot.stableCommit.commitSequence).toBe(2);
          const historyEffects = settled.effects.filter(({ type }) => (
            type === 'push-url' || type === 'replace-url'
          ));
          if (origin === 'popstate') expect(historyEffects).toEqual([]);
          else expect(historyEffects).toEqual([{
            type: 'push-url',
            pathname: '/',
            hash: target.directEntry.canonicalHash
          }]);
        }
      }
    }
  });

  it('supersedes warm candidates without losing the original anchor', () => {
    const source = prove(boot('brand', 'authority:supersede'));
    if (source.snapshot.status !== 'stable') throw new Error('source did not settle');
    const stableCommit = source.snapshot.stableCommit;
    const first = dispatch(source.snapshot, {
      type: 'entry-requested',
      request: { pathname: '/', hash: '#services', origin: 'menu' }
    });
    const second = dispatch(first.snapshot, {
      type: 'entry-requested',
      request: { pathname: '/', hash: '#contact', origin: 'menu' }
    });
    const current = transaction(second.snapshot);
    expect(current.stableCommit).toBe(stableCommit);
    expect(current.transaction.candidateSceneId).toBe('contact');
    expect(current.transaction.attempt.transactionGeneration).toBe(3);
    expect(second.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'invalidate-attempt' }),
      expect.objectContaining({ type: 'load-dependencies' })
    ]));
  });

  it('rolls every ordered warm entry back to the exact source anchor', () => {
    for (const source of phoneManifest.scenes) {
      const sourceResult = prove(boot(source.id, `authority:failure:${source.id}`));
      if (sourceResult.snapshot.status !== 'stable') throw new Error('source did not settle');
      const sourceCommit = sourceResult.snapshot.stableCommit;
      for (const target of phoneManifest.scenes) {
        if (source.id === target.id) continue;
        for (const origin of ['menu', 'programmatic', 'popstate'] as const) {
          const entry = dispatch(sourceResult.snapshot, {
            type: 'entry-requested',
            request: {
              pathname: '/',
              hash: target.directEntry.canonicalHash,
              origin
            }
          });
          const active = transaction(entry.snapshot).transaction;
          const failure = dispatch(entry.snapshot, {
            type: 'failure-reported',
            slot: active.requiredPrepared[0]!,
            failure: { code: 'fixture-failure', message: target.id, recoverable: true }
          });
          const restored = prove(failure);
          expect(restored.snapshot.status).toBe('stable');
          if (restored.snapshot.status !== 'stable') throw new Error('rollback failed');
          expect(restored.snapshot.stableCommit).toBe(sourceCommit);
          expect(restored.snapshot.stableCommit.commitSequence).toBe(1);
          const urlWrites = restored.effects.filter(({ type }) => (
            type === 'push-url' || type === 'replace-url'
          ));
          expect(urlWrites).toEqual(origin === 'popstate' ? [{
            type: 'replace-url',
            pathname: '/',
            hash: source.directEntry.canonicalHash
          }] : []);
        }
      }
    }
  });

  it('re-proves same-scene entry and failed warm entry without a semantic commit', () => {
    const source = prove(boot('education', 'authority:rollback'));
    if (source.snapshot.status !== 'stable') throw new Error('source did not settle');
    const stableCommit = source.snapshot.stableCommit;
    const previousProof = source.snapshot.presentationProof;

    const same = dispatch(source.snapshot, {
      type: 'entry-requested',
      request: { pathname: '/', hash: '#education', origin: 'popstate' }
    });
    expect(transaction(same.snapshot).transaction.mode).toBe('recovery');
    const sameStable = prove(same);
    expect(sameStable.snapshot.status).toBe('stable');
    if (sameStable.snapshot.status !== 'stable') throw new Error('reproof failed');
    expect(sameStable.snapshot.stableCommit).toBe(stableCommit);
    expect(sameStable.snapshot.presentationProof).not.toBe(previousProof);
    expect(sameStable.snapshot.presentationProof.planeRevision).toBe(2);

    const target = dispatch(source.snapshot, {
      type: 'entry-requested',
      request: { pathname: '/', hash: '#crane-animation', origin: 'popstate' }
    });
    const active = transaction(target.snapshot).transaction;
    const failed = dispatch(target.snapshot, {
      type: 'failure-reported',
      slot: active.requiredPrepared[0]!,
      failure: { code: 'decode', message: 'failed', recoverable: true }
    });
    const rollingBack = transaction(failed.snapshot);
    expect(rollingBack.transaction.mode).toBe('rollback');
    expect(rollingBack.transaction.phase).toBe('rolling-back');
    expect(rollingBack.stableCommit).toBe(stableCommit);

    const restored = prove(failed);
    expect(restored.snapshot.status).toBe('stable');
    if (restored.snapshot.status !== 'stable') throw new Error('rollback did not settle');
    expect(restored.snapshot.stableCommit).toBe(stableCommit);
    expect(restored.snapshot.stableCommit.commitSequence).toBe(1);
    expect(restored.effects).toContainEqual({
      type: 'replace-url',
      pathname: '/',
      hash: '#education'
    });
  });
});

describe('phone event queue and revision semantics', () => {
  it('assigns the frozen serial queue priorities', () => {
    expect(phoneEventPriority({ type: 'disconnect-requested' })).toBe(0);
    expect(phoneEventPriority({ type: 'page-hidden', persisted: true })).toBe(1);
    expect(phoneEventPriority({ type: 'terminal-fault', code: 'rollback' })).toBe(2);
    expect(phoneEventPriority({
      type: 'entry-requested',
      request: { pathname: '/', hash: '#brand', origin: 'menu' }
    })).toBe(3);
    expect(phoneEventPriority({ type: 'page-shown', persisted: true })).toBe(4);
    expect(phoneEventPriority({ type: 'deadline-fired', operation: 'moduleLoad', attempt: null })).toBe(5);
    expect(phoneEventPriority({ type: 'physical-intent', direction: 'forward', epoch: 1 })).toBe(6);
  });

  it('keeps state, commit, generation, and plane revisions independent', () => {
    const initial = boot('hero', 'authority:revisions');
    const start = transaction(initial.snapshot);
    expect(start.stateRevision).toBe(1);
    expect(start.transaction.attempt.transactionGeneration).toBe(1);
    expect(start.transaction.planeRevision).toBeNull();

    const firstSlot = start.transaction.requiredPrepared[0]!;
    const accepted = reportSlot(start, firstSlot);
    const afterEvidence = transaction(accepted.snapshot);
    expect(afterEvidence.stateRevision).toBe(2);
    expect(afterEvidence.transaction.attempt.transactionGeneration).toBe(1);

    const stable = prove(accepted).snapshot;
    expect(stable.status).toBe('stable');
    if (stable.status !== 'stable') throw new Error('expected stable');
    expect(stable.stableCommit.commitSequence).toBe(1);
    expect(stable.presentationProof.planeRevision).toBe(1);

    const same = dispatch(stable, {
      type: 'entry-requested',
      request: { pathname: '/', hash: '#home', origin: 'hash' }
    });
    const recovery = transaction(same.snapshot);
    expect(recovery.transaction.attempt.transactionGeneration).toBe(2);
    expect(recovery.transaction.planeRevision).toBeNull();
    const reprojected = prove(same).snapshot;
    expect(reprojected.status).toBe('stable');
    if (reprojected.status !== 'stable') throw new Error('expected stable');
    expect(reprojected.stableCommit).toBe(stable.stableCommit);
    expect(reprojected.stableCommit.commitSequence).toBe(1);
    expect(reprojected.presentationProof.planeRevision).toBe(2);
    expect(reprojected.stateRevision).toBeGreaterThan(stable.stateRevision);
  });
});

function beginSegment(
  segment: PhoneSegmentManifest,
  direction: 'forward' | 'reverse',
  physicalEpoch = 1,
  reducedMotion = false
): PhoneMachineResult {
  const leg = segment[direction];
  const source = prove(boot(leg.source, `authority:${segment.id}:${direction}:${physicalEpoch}`));
  return dispatch(source.snapshot, {
    type: 'segment-requested',
    direction,
    physicalEpoch,
    reducedMotion
  });
}

function reachPlaying(result: PhoneMachineResult): PhoneMachineResult {
  const prepared = reportRequired(result, 'prepared');
  expect(transaction(prepared.snapshot).transaction.phase).toBe('presenting-source');
  const sourcePlane = reportRequired(prepared, 'final');
  expect(transaction(sourcePlane.snapshot).transaction.phase).toBe('playing');
  return sourcePlane;
}

function reachTargetPresentation(result: PhoneMachineResult): PhoneMachineResult {
  let current = reachPlaying(result);
  for (;;) {
    const active = transaction(current.snapshot).transaction;
    if (active.phase === 'presenting-target') return current;
    if (active.phase === 'playing') {
      current = dispatch(current.snapshot, {
        type: 'transition-completed', attempt: active.attempt
      });
    } else if (active.phase === 'dwelling') {
      current = dispatch(current.snapshot, {
        type: 'dwell-completed', attempt: active.attempt
      });
    } else if (active.phase === 'awaiting-leg-intent') {
      current = dispatch(current.snapshot, {
        type: 'leg-intent', attempt: active.attempt, physicalEpoch: active.stageIndex + 10
      });
    } else {
      throw new Error(`unexpected segment phase ${active.phase}`);
    }
  }
}

describe('phone segment transaction machine', () => {
  it('visits the canonical staged stops for all 15 segments in both directions', () => {
    for (const segment of phoneManifest.segments) {
      for (const direction of ['forward', 'reverse'] as const) {
        const leg = segment[direction];
        const initial = beginSegment(segment, direction);
        const preparing = transaction(initial.snapshot);
        expect(preparing.transaction.mode).toBe('segment');
        expect(preparing.transaction.phase).toBe('preparing');
        expect(preparing.transaction.sourceSceneId).toBe(leg.source);
        expect(preparing.transaction.candidateSceneId).toBe(leg.target);
        expect(preparing.transaction.attempt.segmentId).toBe(segment.id);
        expect(preparing.transaction.attempt.direction).toBe(direction);
        expect(preparing.transaction.closure).toBe(leg.closure);
        expect(new Set(preparing.transaction.requiredPrepared.map(({ leg: slotLeg }) => slotLeg)))
          .toEqual(new Set(['source', 'effect', 'target']));
        expect(preparing.transaction.closure.resourceBudget).toEqual(leg.closure.resourceBudget);

        const targetPlane = reachTargetPresentation(initial);
        const presenting = transaction(targetPlane.snapshot);
        expect(presenting.transaction.phase).toBe('presenting-target');
        expect(presenting.transaction.progress).toBe(1);
        const finals = presenting.transaction.requiredFinal;
        let current = targetPlane;
        for (const slot of finals.slice(0, 4)) current = reportSlot(current.snapshot, slot);
        expect(transaction(current.snapshot).transaction.phase).toBe('aligning');
        current = reportSlot(current.snapshot, finals[4]!);
        expect(transaction(current.snapshot).transaction.phase).toBe('verifying');
        current = reportSlot(current.snapshot, finals[5]!);
        expect(current.snapshot.status).toBe('stable');
        if (current.snapshot.status !== 'stable') throw new Error('segment did not settle');
        expect(current.snapshot.stableCommit.sceneId).toBe(leg.target);
        expect(current.snapshot.stableCommit.commitSequence).toBe(2);
      }
    }
  });

  it('keeps progress monotonic and dwell/intent evidence separate from visible proof', () => {
    for (const id of ['pattern-star-map', 'figure2-distance-expand'] as const) {
      const segment = phoneManifest.segments.find((candidate) => candidate.id === id)!;
      let current = reachPlaying(beginSegment(segment, 'forward'));
      const attempt = transaction(current.snapshot).transaction.attempt;
      current = dispatch(current.snapshot, {
        type: 'transition-progressed', attempt, progress: 0.6
      });
      const monotonic = current.snapshot;
      current = dispatch(current.snapshot, {
        type: 'transition-progressed', attempt, progress: 0.4
      });
      expect(current.snapshot).toBe(monotonic);

      current = dispatch(current.snapshot, { type: 'transition-completed', attempt });
      const boundary = transaction(current.snapshot).transaction;
      expect(['dwelling', 'awaiting-leg-intent']).toContain(boundary.phase);
      expect(boundary.requiredFinal).toEqual([]);
      const advanced = boundary.phase === 'dwelling'
        ? dispatch(current.snapshot, { type: 'dwell-completed', attempt })
        : dispatch(current.snapshot, { type: 'leg-intent', attempt, physicalEpoch: 42 });
      expect(transaction(advanced.snapshot).transaction.phase).toBe('playing');
      expect(transaction(advanced.snapshot).transaction.evidence).toEqual(
        transaction(current.snapshot).transaction.evidence
      );
    }
  });

  it('retains the full closure and proof quorum under reduced motion', () => {
    for (const segment of phoneManifest.segments) {
      const ordinary = beginSegment(segment, 'forward', 1, false);
      const reduced = beginSegment(segment, 'forward', 2, true);
      const ordinaryTransaction = transaction(ordinary.snapshot).transaction;
      const reducedTransaction = transaction(reduced.snapshot).transaction;
      expect(reducedTransaction.reducedMotion).toBe(true);
      expect(reducedTransaction.closure).toBe(ordinaryTransaction.closure);
      expect(reducedTransaction.requiredPrepared.map(({ kind, leg }) => ({ kind, leg })))
        .toEqual(ordinaryTransaction.requiredPrepared.map(({ kind, leg }) => ({ kind, leg })));
      const target = reachTargetPresentation(reduced);
      expect(transaction(target.snapshot).transaction.requiredFinal.map(({ kind }) => kind))
        .toEqual([...PHONE_FINAL_EVIDENCE_KINDS]);
    }
  });

  it('claims one fresh physical epoch and rejects endpoint or momentum reuse', () => {
    const segment = phoneManifest.segments[0]!;
    const settled = reportRequired(reachTargetPresentation(beginSegment(segment, 'forward', 7)), 'final');
    expect(settled.snapshot.status).toBe('stable');
    if (settled.snapshot.status !== 'stable') throw new Error('segment did not settle');
    const reused = dispatch(settled.snapshot, {
      type: 'segment-requested', direction: 'reverse', physicalEpoch: 7
    });
    expect(reused.snapshot).toBe(settled.snapshot);
    const fresh = dispatch(settled.snapshot, {
      type: 'segment-requested', direction: 'reverse', physicalEpoch: 8
    });
    expect(transaction(fresh.snapshot).transaction.candidateSceneId).toBe('hero');

    const endpoint = prove(boot('contact', 'authority:endpoint'));
    const beyond = dispatch(endpoint.snapshot, {
      type: 'segment-requested', direction: 'forward', physicalEpoch: 1
    });
    expect(beyond.snapshot).toBe(endpoint.snapshot);
  });
});

describe('phone rollback, fault, and deadline machine', () => {
  it('rolls failures at every named deadline back without a semantic commit', () => {
    const segment = phoneSegmentBetween('brand', 'figure3-animation')!;
    for (const operation of [
      'moduleLoad', 'mediaPrepare', 'firstFrame', 'planeApply', 'scrollConfirm'
    ] as const) {
      const active = beginSegment(segment, 'forward', operation.length);
      const source = transaction(active.snapshot).stableCommit;
      if (!source) throw new Error('missing rollback anchor');
      const failed = dispatch(active.snapshot, {
        type: 'deadline-fired',
        operation,
        attempt: transaction(active.snapshot).transaction.attempt
      });
      expect(transaction(failed.snapshot).transaction.phase).toBe('rolling-back');
      const restored = prove(failed);
      expect(restored.snapshot.status).toBe('stable');
      if (restored.snapshot.status !== 'stable') throw new Error('rollback did not settle');
      expect(restored.snapshot.stableCommit).toBe(source);
      expect(restored.snapshot.stableCommit.commitSequence).toBe(1);
      expect(restored.snapshot.input.enabled).toBe(true);
    }
  });

  it('rolls load/mount/content/media/frame/playback/plane/coverage/landing/scroll failures', () => {
    const segment = phoneSegmentBetween('education', 'crane-animation')!;
    const failureCodes = [
      'scene-load', 'transition-load', 'mount', 'content', 'media-prepare',
      'first-frame', 'playback', 'plane', 'coverage', 'landing', 'scroll', 'post-paint'
    ];
    for (const [index, code] of failureCodes.entries()) {
      let active = beginSegment(segment, 'forward', index + 1);
      if (code === 'playback') active = reachPlaying(active);
      const finalKinds: Partial<Record<string, PhoneEvidenceKind>> = {
        content: 'content-visible',
        'first-frame': 'frame-visible',
        plane: 'plane-acknowledged',
        coverage: 'coverage-visible',
        landing: 'landing-confirmed',
        scroll: 'scroll-confirmed',
        'post-paint': 'frame-visible'
      };
      const finalKind = finalKinds[code];
      if (finalKind) active = reachTargetPresentation(active);
      const state = transaction(active.snapshot);
      const slot = finalKind
        ? state.transaction.requiredFinal.find(({ kind }) => kind === finalKind)!
        : state.transaction.requiredPrepared[index % state.transaction.requiredPrepared.length]!;
      const failed = dispatch(active.snapshot, {
        type: 'failure-reported',
        slot,
        failure: { code, message: code, recoverable: true }
      });
      expect(transaction(failed.snapshot).transaction.mode).toBe('rollback');
      expect(transaction(failed.snapshot).stableCommit).toBe(state.stableCommit);
    }
  });

  it('enters a bounded terminal fault when source re-proof or rollback deadline fails', () => {
    const segment = phoneSegmentBetween('education', 'crane-animation')!;
    const rollback = (): PhoneMachineResult => {
      const active = beginSegment(segment, 'reverse', 31);
      const state = transaction(active.snapshot);
      return dispatch(active.snapshot, {
        type: 'failure-reported',
        slot: state.transaction.requiredPrepared[0]!,
        failure: { code: 'candidate', message: 'candidate', recoverable: true }
      });
    };

    for (const kind of ['module-loaded', 'canvas-drawn'] as const) {
      const active = rollback();
      const state = transaction(active.snapshot);
      const slot = state.transaction.requiredPrepared.find((candidate) => candidate.kind === kind);
      if (!slot) throw new Error(`missing rollback ${kind} slot`);
      const faulted = dispatch(active.snapshot, {
        type: 'failure-reported',
        slot,
        failure: { code: `source-${kind}`, message: kind, recoverable: true }
      });
      expect(faulted.snapshot.status).toBe('faulted');
      if (faulted.snapshot.status !== 'faulted') throw new Error('expected fault');
      expect(faulted.snapshot.safeCover.kind).toBe('committed-plane');
    }

    for (const kind of ['plane-acknowledged', 'scroll-confirmed'] as const) {
      const prepared = reportRequired(rollback(), 'prepared');
      const state = transaction(prepared.snapshot);
      const slot = state.transaction.requiredFinal.find((candidate) => candidate.kind === kind)!;
      const faulted = dispatch(prepared.snapshot, {
        type: 'failure-reported',
        slot,
        failure: { code: `source-${kind}`, message: kind, recoverable: false }
      });
      expect(faulted.snapshot.status).toBe('faulted');
    }

    const timed = rollback();
    const deadlineFault = dispatch(timed.snapshot, {
      type: 'deadline-fired',
      operation: 'rollback',
      attempt: transaction(timed.snapshot).transaction.attempt
    });
    expect(deadlineFault.snapshot.status).toBe('faulted');
  });

  it('coalesces the newest warm entry until rollback source proof publishes', () => {
    const segment = phoneSegmentBetween('services', 'ttg-animation')!;
    const active = beginSegment(segment, 'forward');
    const state = transaction(active.snapshot);
    const retiredSlot = state.transaction.requiredPrepared[0]!;
    let rollback = dispatch(active.snapshot, {
      type: 'failure-reported',
      slot: retiredSlot,
      failure: { code: 'candidate', message: 'candidate', recoverable: true }
    });
    const ignored = reportSlot(rollback.snapshot, retiredSlot, ':late');
    expect(ignored.snapshot).toBe(rollback.snapshot);
    rollback = dispatch(rollback.snapshot, {
      type: 'entry-requested',
      request: { pathname: '/', hash: '#brand', origin: 'menu' }
    });
    rollback = dispatch(rollback.snapshot, {
      type: 'entry-requested',
      request: { pathname: '/', hash: '#contact', origin: 'menu' }
    });
    expect(transaction(rollback.snapshot).transaction.pendingEntry?.hash).toBe('#contact');
    const restored = prove(rollback);
    expect(restored.snapshot.status).toBe('stable');
    expect(restored.effects).toContainEqual({
      type: 'defer-entry',
      request: { pathname: '/', hash: '#contact', origin: 'menu' }
    });
  });
});
