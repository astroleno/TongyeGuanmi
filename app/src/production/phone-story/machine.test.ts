import { describe, expect, it } from 'vitest';

import {
  createPhoneEvidenceSlot,
  createPhoneStoryBoot,
  dequeuePhoneStoryEvent,
  enqueuePhoneStoryEvent,
  phoneEventPriority,
  reducePhoneStory,
  selectPhoneCheckpoint,
  selectPhoneEdgeSurface,
  selectPhoneNavigationScene,
  type PhoneEventQueue,
  type PhoneMachineResult,
  type PhoneMachineSnapshot,
  type PhoneMachineTransactionSnapshot
} from './machine';
import {
  phoneEntryForLocation,
  phoneManifest,
  phoneSceneById,
  type PhoneSceneId
} from './manifest';
import type {
  PhoneEvidenceSlot,
  PhoneStoryEvent
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

  it('dequeues by lane and preserves FIFO order within a lane', () => {
    const inputA: PhoneStoryEvent = {
      type: 'physical-intent', direction: 'forward', epoch: 1
    };
    const inputB: PhoneStoryEvent = {
      type: 'physical-intent', direction: 'reverse', epoch: 2
    };
    const entry: PhoneStoryEvent = {
      type: 'entry-requested',
      request: { pathname: '/', hash: '#brand', origin: 'menu' }
    };
    const disconnected: PhoneStoryEvent = { type: 'disconnect-requested' };
    const queue = [inputA, inputB, entry, disconnected].reduce<PhoneEventQueue>(
      (current, event, sequence) => enqueuePhoneStoryEvent(current, event, sequence),
      []
    );
    const first = dequeuePhoneStoryEvent(queue);
    const second = dequeuePhoneStoryEvent(first.queue);
    const third = dequeuePhoneStoryEvent(second.queue);
    const fourth = dequeuePhoneStoryEvent(third.queue);
    expect(first.item?.event).toBe(disconnected);
    expect(second.item?.event).toBe(entry);
    expect(third.item?.event).toBe(inputA);
    expect(fourth.item?.event).toBe(inputB);
    expect(dequeuePhoneStoryEvent(fourth.queue).item).toBeNull();
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
