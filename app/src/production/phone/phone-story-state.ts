import type { SceneId, SegmentId } from '../../story/types';
import {
  phoneRun,
  type PhoneCursorRunId,
  type PhoneRunDefinition,
  type PhoneRunId
} from './phone-story-runs';

export type PhoneTransitionPhase =
  | 'preparing'
  | 'presented-frame-ready'
  | 'animating'
  | 'committing'
  | 'landing'
  | 'releasing'
  | 'rolling-back';

/** Phases adapters may report; commit and release remain controller-owned. */
export type PhoneAdapterTransitionPhase = Extract<
  PhoneTransitionPhase,
  'preparing' | 'presented-frame-ready' | 'animating'
>;

export type PhoneStoryHold = Readonly<{
  kind: 'hold';
  scene: SceneId;
  revision: number;
}>;

export type PhoneStoryTransition = Readonly<{
  kind: 'transition';
  revision: number;
  sessionId: string;
  generation: number;
  run: PhoneCursorRunId;
  legIndex: number;
  runSource: SceneId;
  runTarget: SceneId;
  segment: SegmentId;
  from: SceneId;
  to: SceneId;
  direction: 1 | -1;
  phase: PhoneTransitionPhase;
  progress: number;
}>;

export type PhoneStoryCursor = PhoneStoryHold | PhoneStoryTransition;

export type PhoneStorySessionIdentity = Readonly<{
  sessionId: string;
  generation: number;
}>;

export type PhoneStoryEvent =
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'PHASE';
      phase: PhoneAdapterTransitionPhase;
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'PROGRESS';
      progress: number;
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'ADVANCE_LEG';
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'COMMIT';
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'LAND';
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'RELEASE';
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'SETTLE';
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'FAIL';
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'ROLLBACK_COMMITTED';
    }>);

export function createPhoneStoryHold(
  scene: SceneId,
  revision = 0
): PhoneStoryHold {
  return { kind: 'hold', scene, revision };
}

function directionalEndpoints(
  run: PhoneRunDefinition,
  direction: 1 | -1
): Readonly<{ source: SceneId; target: SceneId }> {
  return direction === 1
    ? { source: run.from, target: run.to }
    : { source: run.to, target: run.from };
}

function transitionAtLeg(
  run: PhoneRunDefinition,
  legIndex: number,
  direction: 1 | -1,
  identity: PhoneStorySessionIdentity,
  revision: number
): PhoneStoryTransition {
  const leg = run.legs[legIndex];
  if (!leg) {
    throw new Error(`Phone run ${run.id} has no leg ${legIndex}`);
  }
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
  cursor: PhoneStoryCursor,
  runId: PhoneRunId,
  direction: 1 | -1,
  identity: PhoneStorySessionIdentity,
  legIndex?: number
): PhoneStoryTransition {
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
  const initialLegIndex = legIndex ?? (
    direction === 1 ? 0 : run.legs.length - 1
  );
  return transitionAtLeg(
    run,
    initialLegIndex,
    direction,
    identity,
    cursor.revision
  );
}

function eventOwnsCursor(
  cursor: PhoneStoryTransition,
  event: PhoneStoryEvent
): boolean {
  return cursor.sessionId === event.sessionId
    && cursor.generation === event.generation;
}

function isTerminalLeg(cursor: PhoneStoryTransition): boolean {
  if (cursor.run.endsWith('-scroll')) return true;
  const run = phoneRun(cursor.run as PhoneRunId);
  return cursor.direction === 1
    ? cursor.legIndex === run.legs.length - 1
    : cursor.legIndex === 0;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function reducePhoneStoryCursor(
  cursor: PhoneStoryCursor,
  event: PhoneStoryEvent
): PhoneStoryCursor {
  if (cursor.kind !== 'transition' || !eventOwnsCursor(cursor, event)) {
    return cursor;
  }
  if (event.type === 'FAIL') {
    if (cursor.phase === 'rolling-back') return cursor;
    return { ...cursor, phase: 'rolling-back' };
  }
  if (event.type === 'ROLLBACK_COMMITTED') {
    if (cursor.phase !== 'rolling-back') return cursor;
    return createPhoneStoryHold(cursor.runSource, cursor.revision + 1);
  }
  if (cursor.phase === 'rolling-back') return cursor;
  if (event.type === 'PHASE') {
    const legal = (
      (cursor.phase === 'preparing' && event.phase === 'presented-frame-ready')
      || (
        cursor.phase === 'presented-frame-ready'
        && event.phase === 'animating'
      )
    );
    return legal ? { ...cursor, phase: event.phase } : cursor;
  }
  if (event.type === 'PROGRESS') {
    const progress = clamp(event.progress);
    const monotonic = cursor.direction === 1
      ? progress >= cursor.progress
      : progress <= cursor.progress;
    if (!monotonic || progress === cursor.progress) return cursor;
    return { ...cursor, progress };
  }
  if (event.type === 'ADVANCE_LEG') {
    if (isTerminalLeg(cursor) || cursor.phase !== 'animating') return cursor;
    const run = phoneRun(cursor.run as PhoneRunId);
    const legIndex = cursor.legIndex + cursor.direction;
    return transitionAtLeg(
      run,
      legIndex,
      cursor.direction,
      cursor,
      cursor.revision
    );
  }
  if (event.type === 'COMMIT') {
    if (isTerminalLeg(cursor) && cursor.phase === 'animating') {
      return { ...cursor, phase: 'committing' };
    }
    return cursor;
  }
  if (event.type === 'LAND') {
    return cursor.phase === 'committing'
      ? { ...cursor, phase: 'landing' }
      : cursor;
  }
  if (event.type === 'RELEASE') {
    return cursor.phase === 'landing'
      ? { ...cursor, phase: 'releasing' }
      : cursor;
  }
  if (event.type === 'SETTLE') {
    if (cursor.phase !== 'releasing') return cursor;
    return createPhoneStoryHold(cursor.runTarget, cursor.revision + 1);
  }
  return cursor;
}
