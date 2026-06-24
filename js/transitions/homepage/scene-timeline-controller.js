import { timelineJoins, timelineScenes } from './scene-timeline-manifest.js';
import { setRevealPresentedWithin } from '../../ui/reveal.js';

const clamp01 = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const smooth01 = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const range01 = (value, range) => {
  if (!Array.isArray(range) || range.length !== 2) return clamp01(value);
  const [start, end] = range;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return value >= end ? 1 : 0;
  }
  return clamp01((value - start) / (end - start));
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSceneCopyTargets(root, scene) {
  return asArray(scene?.copySelectors)
    .flatMap((copy) => [...root.querySelectorAll(copy.selector)]);
}

function getSceneSection(root, scene) {
  const selector = scene?.sectionSelector || scene?.sceneSelector;
  return selector ? root.querySelector(selector) : null;
}

function checkCondition(condition, state, milestones) {
  if (condition === 'progress:commitAt') return state.progress >= state.commitAt;
  if (condition === 'progress:presentAt') return state.progress >= state.presentAt;
  return Boolean(milestones?.[condition]);
}

function conditionsMet(conditions, state, milestones) {
  return asArray(conditions).every((condition) => checkCondition(condition, state, milestones));
}

function resolveTiming(join) {
  const presentAt = Number.isFinite(join.presentAt)
    ? join.presentAt
    : Math.max(join.commitAt || 0, asArray(join.targetIn)[1] || 0);
  const cleanupAt = Number.isFinite(join.cleanupAt) ? join.cleanupAt : presentAt;

  return {
    commitAt: Number.isFinite(join.commitAt) ? join.commitAt : presentAt,
    presentAt,
    cleanupAt
  };
}

export function deriveTimelineState(join, progress, milestones = {}) {
  const safeProgress = clamp01(progress);
  const timing = resolveTiming(join);
  const baseState = {
    joinId: join.id,
    transitionId: join.transitionId,
    handoffId: join.handoffId || '',
    fromScene: join.fromScene,
    toScene: join.toScene,
    progress: safeProgress,
    sourceOpacity: 1 - smooth01(range01(safeProgress, join.sourceOut)),
    targetOpacity: smooth01(range01(safeProgress, join.targetIn)),
    commitAt: timing.commitAt,
    presentAt: timing.presentAt,
    cleanupAt: timing.cleanupAt,
    milestones: { ...milestones }
  };

  const commitConditions = join.commitCondition || ['progress:commitAt'];
  const presentConditions = join.presentCondition || ['progress:presentAt'];
  const targetCommitted = conditionsMet(commitConditions, baseState, milestones);
  const targetPresented = targetCommitted && conditionsMet(presentConditions, baseState, milestones);

  return Object.freeze({
    ...baseState,
    targetCommitted,
    targetPresented,
    cleanupReady: targetPresented && safeProgress >= timing.cleanupAt,
    active: safeProgress > 0 && safeProgress < 1,
    phase: targetPresented ? 'presented' : targetCommitted ? 'committed' : 'transitioning'
  });
}

export function createSceneTimelineController({
  root = document,
  joins = timelineJoins,
  scenes = timelineScenes
} = {}) {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const stateByJoinId = new Map();
  const presentedJoinIds = new Set();

  function getJoinForHost(host) {
    if (!host) return null;
    const transitionId = host.dataset?.transitionId || host.dataset?.transition || '';
    const handoffId = host.dataset?.handoffId || '';
    return joins.find((join) => (
      join.transitionId === transitionId
      || join.id === transitionId
      || (handoffId && join.handoffId === handoffId)
    )) || null;
  }

  function presentTarget(join, state) {
    if (!join || !state || presentedJoinIds.has(join.id)) return;
    const scene = sceneById.get(join.toScene);
    if (!scene) return;

    const section = getSceneSection(root, scene);
    const copies = getSceneCopyTargets(root, scene);
    section?.setAttribute('data-scene-state', 'presented');
    section?.setAttribute('data-section-handoff-state', 'presented');
    copies.forEach((copy) => {
      copy.setAttribute('data-entry-state', 'presented');
      copy.dataset.entryState = 'presented';
      setRevealPresentedWithin(copy);
    });
    presentedJoinIds.add(join.id);
  }

  function update(join, progress, { milestones = {}, reason = 'update' } = {}) {
    if (!join) return null;
    const state = deriveTimelineState(join, progress, milestones);
    stateByJoinId.set(join.id, state);

    const scene = sceneById.get(join.toScene);
    const section = getSceneSection(root, scene);
    const copies = getSceneCopyTargets(root, scene);
    section?.style?.setProperty('--timeline-target-opacity', state.targetOpacity.toFixed(4));
    copies.forEach((copy) => {
      copy.style?.setProperty('--timeline-target-opacity', state.targetOpacity.toFixed(4));
      copy.setAttribute('data-timeline-phase', state.phase);
      copy.setAttribute('data-timeline-reason', reason);
    });

    if (state.targetPresented) presentTarget(join, state);
    return state;
  }

  function createAdapterContext(host) {
    const join = getJoinForHost(host);

    return Object.freeze({
      join,
      getState() {
        return join ? stateByJoinId.get(join.id) || deriveTimelineState(join, 0) : null;
      },
      update(progress, options) {
        return update(join, progress, options);
      },
      commit(reason = 'adapter-commit') {
        return update(join, join?.commitAt ?? 1, { reason });
      },
      present(reason = 'adapter-present') {
        return update(join, join?.presentAt ?? 1, { reason });
      },
      complete(reason = 'adapter-complete') {
        return update(join, 1, { reason });
      }
    });
  }

  return Object.freeze({
    getJoinForHost,
    createAdapterContext,
    getState(joinId) {
      return stateByJoinId.get(joinId) || null;
    },
    update,
    presentTarget
  });
}
