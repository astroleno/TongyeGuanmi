const PHASES = Object.freeze([
  'idle',
  'preparing',
  'playing',
  'committed',
  'presented',
  'cleanup',
  'released'
]);

const COPY_OWNERS = Object.freeze(['hidden', 'timeline-fixed', 'native']);
const VISUAL_OWNERS = Object.freeze(['adapter', 'native', 'compositor']);
const INTERACTION_OWNERS = Object.freeze(['director', 'native', 'none']);
const DIRECTIONS = Object.freeze([-1, 0, 1]);

/**
 * SceneTimelineFrame is the migration-period frame contract for homepage joins.
 *
 * Existing `deriveTimelineState()` phases map into this contract as:
 * `transitioning` -> `playing`, `committed` -> `committed`,
 * `presented` -> `presented`. During the migration, both shapes may coexist
 * inside controller internals while adapters move toward this frame shape.
 *
 * @typedef {'idle'|'preparing'|'playing'|'committed'|'presented'|'cleanup'|'released'} SceneTimelinePhase
 * @typedef {'hidden'|'timeline-fixed'|'native'} SceneTimelineCopyOwner
 * @typedef {'adapter'|'native'|'compositor'} SceneTimelineVisualOwner
 * @typedef {'director'|'native'|'none'} SceneTimelineInteractionOwner
 * @typedef {-1|0|1} SceneTimelineDirection
 *
 * @typedef {Readonly<{
 *   joinId: string,
 *   fromScene: string,
 *   toScene: string,
 *   direction: SceneTimelineDirection,
 *   phase: SceneTimelinePhase,
 *   progress: number,
 *   sourceOpacity: number,
 *   targetOpacity: number,
 *   copyOwner: SceneTimelineCopyOwner,
 *   visualOwner: SceneTimelineVisualOwner,
 *   interactionOwner: SceneTimelineInteractionOwner,
 *   milestones: Readonly<Record<string, boolean>>
 * }>} SceneTimelineFrame
 */

function assertEnum(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${name} must be one of: ${allowed.join(', ')}`);
  }
}

function assertUnitInterval(name, value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${name} must be a finite number in 0..1`);
  }
}

function assertString(name, value) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
}

function normalizeMilestones(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('milestones must be an object');
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, flag]) => [key, Boolean(flag)])
  );
}

/**
 * @param {Partial<SceneTimelineFrame>} partial
 * @returns {SceneTimelineFrame}
 */
export function createFrame(partial = {}) {
  const frame = {
    joinId: partial.joinId ?? '',
    fromScene: partial.fromScene ?? '',
    toScene: partial.toScene ?? '',
    direction: partial.direction ?? 0,
    phase: partial.phase ?? 'idle',
    progress: partial.progress ?? 0,
    sourceOpacity: partial.sourceOpacity ?? 1,
    targetOpacity: partial.targetOpacity ?? 0,
    copyOwner: partial.copyOwner ?? 'hidden',
    visualOwner: partial.visualOwner ?? 'native',
    interactionOwner: partial.interactionOwner ?? 'none',
    milestones: Object.freeze(normalizeMilestones(partial.milestones))
  };

  assertString('joinId', frame.joinId);
  assertString('fromScene', frame.fromScene);
  assertString('toScene', frame.toScene);
  assertEnum('direction', frame.direction, DIRECTIONS);
  assertEnum('phase', frame.phase, PHASES);
  assertUnitInterval('progress', frame.progress);
  assertUnitInterval('sourceOpacity', frame.sourceOpacity);
  assertUnitInterval('targetOpacity', frame.targetOpacity);
  assertEnum('copyOwner', frame.copyOwner, COPY_OWNERS);
  assertEnum('visualOwner', frame.visualOwner, VISUAL_OWNERS);
  assertEnum('interactionOwner', frame.interactionOwner, INTERACTION_OWNERS);

  return Object.freeze(frame);
}

export const SceneTimelineFrameContract = Object.freeze({
  phases: PHASES,
  copyOwners: COPY_OWNERS,
  visualOwners: VISUAL_OWNERS,
  interactionOwners: INTERACTION_OWNERS,
  directions: DIRECTIONS
});
