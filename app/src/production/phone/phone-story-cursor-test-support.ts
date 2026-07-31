import type { SceneId } from '../../story/types';
import { phoneRun, type PhoneRunDefinition, type PhoneRunId } from './phone-story-runs';
import type {
  PhoneAdapterTransitionPhase,
  PhoneStoryHold,
  PhoneStoryTransition
} from './phone-story/machine';

/** Test-only compatibility model for historical cursor fixtures. */
export type PhoneStorySessionIdentity = Readonly<{
  sessionId: string;
  generation: number;
}>;

type PhoneLegacyStoryHold = PhoneStoryHold & Readonly<{
  revision: number;
}>;

type PhoneLegacyStoryTransition = PhoneStoryTransition & Readonly<{
  revision: number;
  generation: number;
  runTarget: SceneId;
}>;

export type PhoneStoryLegacyCursor = PhoneLegacyStoryHold | PhoneLegacyStoryTransition;

export type PhoneStoryCursorEvent =
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'PHASE';
      phase: PhoneAdapterTransitionPhase;
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'PROGRESS';
      progress: number;
    }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'ADVANCE_LEG' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'COMMIT' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'LAND' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'RELEASE' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'SETTLE' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'FAIL' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'ROLLBACK_COMMITTED' }>);

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function directionalEndpoints(
  run: PhoneRunDefinition,
  direction: 1 | -1
): Readonly<{ source: SceneId; target: SceneId }> {
  return direction === 1
    ? { source: run.from, target: run.to }
    : { source: run.to, target: run.from };
}

export function createPhoneStoryHold(
  scene: SceneId,
  revision = 0
): PhoneLegacyStoryHold {
  return { kind: 'hold', scene, revision };
}

function transitionAtLeg(
  run: PhoneRunDefinition,
  legIndex: number,
  direction: 1 | -1,
  identity: PhoneStorySessionIdentity,
  revision: number
): PhoneLegacyStoryTransition {
  const leg = run.legs[legIndex];
  if (!leg) throw new Error(`Phone run ${run.id} has no leg ${legIndex}`);
  const endpoints = directionalEndpoints(run, direction);
  return {
    kind: 'transition',
    revision,
    sessionId: identity.sessionId,
    generation: identity.generation,
    run: run.id,
    legIndex,
    runSource: endpoints.source,
    runTarget: endpoints.target,
    segment: leg.segment,
    from: leg.from,
    to: leg.to,
    direction,
    phase: 'preparing',
    progress: direction === 1 ? 0 : 1
  };
}

export function startPhoneStoryRun(
  cursor: PhoneStoryLegacyCursor,
  runId: PhoneRunId,
  direction: 1 | -1,
  identity: PhoneStorySessionIdentity,
  legIndex?: number
): PhoneLegacyStoryTransition {
  if (cursor.kind !== 'hold') {
    throw new Error('Cannot start a phone run outside a stable hold');
  }
  const run = phoneRun(runId);
  const endpoints = directionalEndpoints(run, direction);
  if (cursor.scene !== endpoints.source) {
    throw new Error(
      `Phone run ${runId} cannot start from ${cursor.scene} in direction ${direction}`
    );
  }
  return transitionAtLeg(
    run,
    legIndex ?? (direction === 1 ? 0 : run.legs.length - 1),
    direction,
    identity,
    cursor.revision
  );
}

function eventOwnsCursor(
  cursor: PhoneLegacyStoryTransition,
  event: PhoneStoryCursorEvent
): boolean {
  return cursor.sessionId === event.sessionId && cursor.generation === event.generation;
}

function terminalLeg(cursor: PhoneLegacyStoryTransition): boolean {
  const run = phoneRun(cursor.run as PhoneRunId);
  return cursor.direction === 1
    ? cursor.legIndex === run.legs.length - 1
    : cursor.legIndex === 0;
}

export function reducePhoneStoryCursor(
  cursor: PhoneStoryLegacyCursor,
  event: PhoneStoryCursorEvent
): PhoneStoryLegacyCursor {
  if (cursor.kind !== 'transition' || !eventOwnsCursor(cursor, event)) return cursor;
  if (event.type === 'FAIL') {
    return cursor.phase === 'rolling-back' ? cursor : { ...cursor, phase: 'rolling-back' };
  }
  if (event.type === 'ROLLBACK_COMMITTED') {
    return cursor.phase === 'rolling-back'
      ? createPhoneStoryHold(cursor.runSource, cursor.revision + 1)
      : cursor;
  }
  if (cursor.phase === 'rolling-back') return cursor;
  if (event.type === 'PHASE') {
    const legal = (
      (cursor.phase === 'preparing' && event.phase === 'presented-frame-ready')
      || (cursor.phase === 'presented-frame-ready' && event.phase === 'animating')
    );
    return legal ? { ...cursor, phase: event.phase } : cursor;
  }
  if (event.type === 'PROGRESS') {
    const progress = clamp(event.progress);
    const monotonic = cursor.direction === 1
      ? progress >= cursor.progress
      : progress <= cursor.progress;
    if (!monotonic || progress === cursor.progress) return cursor;
    return cursor.phase === 'preparing'
      ? { ...cursor, phase: 'animating', progress }
      : { ...cursor, progress };
  }
  if (event.type === 'ADVANCE_LEG') {
    if (terminalLeg(cursor) || cursor.phase !== 'animating') return cursor;
    return transitionAtLeg(
      phoneRun(cursor.run as PhoneRunId),
      cursor.legIndex + cursor.direction,
      cursor.direction,
      cursor,
      cursor.revision
    );
  }
  if (event.type === 'COMMIT') {
    return terminalLeg(cursor) && cursor.phase === 'animating'
      ? { ...cursor, phase: 'committing' }
      : cursor;
  }
  if (event.type === 'LAND') {
    return cursor.phase === 'committing' ? { ...cursor, phase: 'landing' } : cursor;
  }
  if (event.type === 'RELEASE') {
    return cursor.phase === 'landing' ? { ...cursor, phase: 'releasing' } : cursor;
  }
  if (event.type === 'SETTLE') {
    return cursor.phase === 'releasing'
      ? createPhoneStoryHold(cursor.runTarget, cursor.revision + 1)
      : cursor;
  }
  return cursor;
}
