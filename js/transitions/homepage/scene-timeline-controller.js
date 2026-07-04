import { timelineJoins, timelineScenes } from './scene-timeline-manifest.js';
import { createFrame } from './scene-timeline-frame.js';
import {
  markSectionHandoffPreparing,
  markSectionHandoffPresented,
  markSectionScenePresented
} from './section-presentation-controller.js';
import { claimRevealWithin } from '../../ui/reveal.js';

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

const FIXED_COPY_CLASS = 'homepage-timeline-copy-active';
const ROOT_FIXED_COPY_CLASS = 'homepage-timeline-target-active';

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

function shouldFixTargetCopy(join) {
  return join?.progressPolicy !== 'scroll';
}

function isSectionInReleaseRange(section) {
  if (!section) return false;
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const rect = section.getBoundingClientRect();
  return rect.top < viewportHeight * 0.18 && rect.bottom > viewportHeight * 0.42;
}

function syncTimelineCopyStyle(copy, state) {
  const opacity = state.targetOpacity;
  copy.style?.setProperty('--timeline-target-opacity', opacity.toFixed(4));
  copy.style?.setProperty('--timeline-target-y', `${((1 - opacity) * 30).toFixed(2)}px`);
  copy.style?.setProperty('--timeline-target-blur', `${((1 - opacity) * 10).toFixed(2)}px`);
  copy.setAttribute('data-timeline-phase', state.phase);
}

function clearTimelineCopyStyle(copy) {
  copy.style?.removeProperty('--timeline-target-opacity');
  copy.style?.removeProperty('--timeline-target-y');
  copy.style?.removeProperty('--timeline-target-blur');
  copy.removeAttribute('data-timeline-phase');
  copy.removeAttribute('data-timeline-reason');
}

function normalizeDirection(direction) {
  return direction < 0 ? -1 : direction > 0 ? 1 : 0;
}

function framePhaseFromState(state) {
  if (state.targetPresented) return 'presented';
  if (state.targetCommitted) return 'committed';
  if (state.progress <= 0.001) return 'idle';
  return 'playing';
}

function copyOwnerFromState(state) {
  if (state.targetPresented) return 'native';
  if (state.targetOpacity > 0.001 || (state.progress > 0.001 && state.progress < 0.998)) {
    return 'timeline-fixed';
  }
  return 'hidden';
}

function createFrameFromState(join, state, {
  direction = 1,
  phase = framePhaseFromState(state),
  copyOwner = copyOwnerFromState(state),
  visualOwner = state.targetPresented ? 'native' : 'adapter',
  interactionOwner = state.targetPresented ? 'native' : 'director'
} = {}) {
  return createFrame({
    joinId: join.id,
    fromScene: join.fromScene,
    toScene: join.toScene,
    direction: normalizeDirection(direction),
    phase,
    progress: state.progress,
    sourceOpacity: state.sourceOpacity,
    targetOpacity: state.targetOpacity,
    copyOwner,
    visualOwner,
    interactionOwner,
    milestones: state.milestones
  });
}

function forcePresentedState(join, state) {
  const baseState = deriveTimelineState(join, 1, state?.milestones || {});
  return Object.freeze({
    ...baseState,
    targetCommitted: true,
    targetPresented: true,
    cleanupReady: true,
    active: false,
    phase: 'presented'
  });
}

function eventTargetForRoot(root) {
  return typeof root?.dispatchEvent === 'function'
    ? root
    : root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
}

function dispatchPresented(root, detail) {
  const target = eventTargetForRoot(root);
  if (!target) return;
  const EventCtor = root?.defaultView?.CustomEvent
    || (typeof window !== 'undefined' ? window.CustomEvent : null)
    || globalThis.CustomEvent;
  const event = typeof EventCtor === 'function'
    ? new EventCtor('scene-timeline:presented', { detail })
    : { type: 'scene-timeline:presented', detail };
  target.dispatchEvent(event);
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
  const rootElement = root.documentElement || document.documentElement;
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const joinById = new Map();
  joins.forEach((join) => {
    [join.id, join.transitionId, join.handoffId].filter(Boolean).forEach((id) => {
      if (!joinById.has(id)) joinById.set(id, join);
    });
  });

  const stateByJoinId = new Map();
  const lastFrameByJoinId = new Map();
  const directionByJoinId = new Map();
  const committedJoinIds = new Set();
  const presentedJoinIds = new Set();
  const fixedCopyElements = new Set();
  let activeFixedJoinId = '';
  let activeJoinId = '';

  function resolveJoin(joinIdOrJoin) {
    if (joinIdOrJoin && typeof joinIdOrJoin === 'object') return joinIdOrJoin;
    return joinById.get(String(joinIdOrJoin || '')) || null;
  }

  function getJoinForHost(host) {
    if (!host) return null;
    const transitionId = host.dataset?.transitionId || host.dataset?.transition || '';
    const handoffId = host.dataset?.handoffId || '';
    return joinById.get(transitionId) || joinById.get(handoffId) || null;
  }

  function setFixedCopy(copy, active) {
    if (!copy) return;
    if (active) {
      fixedCopyElements.add(copy);
      copy.classList.add(FIXED_COPY_CLASS);
      copy.setAttribute('data-timeline-fixed', 'true');
      rootElement?.classList?.add(ROOT_FIXED_COPY_CLASS);
      return;
    }

    fixedCopyElements.delete(copy);
    copy.classList.remove(FIXED_COPY_CLASS);
    copy.removeAttribute('data-timeline-fixed');
    copy.style.removeProperty('--timeline-target-y');
    copy.style.removeProperty('--timeline-target-blur');
    if (!fixedCopyElements.size) rootElement?.classList?.remove(ROOT_FIXED_COPY_CLASS);
  }

  function clearFixedCopies(copies, { clearStyle = false } = {}) {
    copies.forEach((copy) => {
      setFixedCopy(copy, false);
      if (clearStyle) clearTimelineCopyStyle(copy);
    });
  }

  function clearAllFixedCopies({ clearStyle = false } = {}) {
    [...fixedCopyElements].forEach((copy) => {
      setFixedCopy(copy, false);
      if (clearStyle) clearTimelineCopyStyle(copy);
    });
    activeFixedJoinId = '';
  }

  function beginJoin(joinId, { direction = 1, reason = 'begin-join' } = {}) {
    const join = resolveJoin(joinId);
    if (!join) return null;

    if (activeJoinId && activeJoinId !== join.id) {
      const previousFrame = lastFrameByJoinId.get(activeJoinId);
      if (previousFrame?.phase !== 'released') {
        console.warn(`SceneTimeline beginJoin(${join.id}) cleaning active join ${activeJoinId}.`);
        cleanupJoin(activeJoinId, 'begin-join-switch');
      }
    }

    activeJoinId = join.id;
    directionByJoinId.set(join.id, normalizeDirection(direction));
    const state = deriveTimelineState(join, 0);
    stateByJoinId.set(join.id, state);
    const frame = createFrameFromState(join, state, {
      direction,
      phase: 'preparing',
      copyOwner: 'hidden',
      visualOwner: 'adapter',
      interactionOwner: 'director'
    });
    lastFrameByJoinId.set(join.id, frame);

    const scene = sceneById.get(join.toScene);
    const section = getSceneSection(root, scene);
    if (direction > 0) markSectionHandoffPreparing(section);

    const copies = getSceneCopyTargets(root, scene);
    copies.forEach((copy) => copy.setAttribute('data-timeline-reason', reason));
    return frame;
  }

  function commitTarget(joinId, reason = 'commit-target') {
    const join = resolveJoin(joinId);
    if (!join) return null;
    const scene = sceneById.get(join.toScene);
    const section = getSceneSection(root, scene);
    const currentState = stateByJoinId.get(join.id) || deriveTimelineState(join, resolveTiming(join).commitAt);
    const committedState = Object.freeze({
      ...currentState,
      targetCommitted: true,
      phase: currentState.targetPresented ? 'presented' : 'committed'
    });
    stateByJoinId.set(join.id, committedState);
    committedJoinIds.add(join.id);

    section?.setAttribute('data-scene-state', 'committed');
    section?.setAttribute('data-timeline-active-join', join.id);

    const frame = createFrameFromState(join, committedState, {
      direction: directionByJoinId.get(join.id) ?? 1,
      phase: committedState.targetPresented ? 'presented' : 'committed',
      copyOwner: committedState.targetPresented ? 'native' : copyOwnerFromState(committedState),
      visualOwner: committedState.targetPresented ? 'native' : 'adapter',
      interactionOwner: committedState.targetPresented ? 'native' : 'director'
    });
    lastFrameByJoinId.set(join.id, frame);

    const copies = getSceneCopyTargets(root, scene);
    copies.forEach((copy) => copy.setAttribute('data-timeline-reason', reason));
    return frame;
  }

  function presentTarget(joinIdOrJoin, reasonOrState = 'present-target') {
    const join = resolveJoin(joinIdOrJoin);
    if (!join) return null;
    const reason = typeof reasonOrState === 'string' ? reasonOrState : 'legacy-signature';
    if (presentedJoinIds.has(join.id)) return lastFrameByJoinId.get(join.id) || null;

    if (!lastFrameByJoinId.has(join.id)) {
      updateFrameForJoin(join, 1, { reason: 'present-without-frame' }, { autoPresent: false });
    }

    const scene = sceneById.get(join.toScene);
    if (!scene) return null;
    const section = getSceneSection(root, scene);
    const copies = getSceneCopyTargets(root, scene);

    markSectionScenePresented(section);
    markSectionHandoffPresented(section);
    section?.removeAttribute('data-timeline-active-join');

    copies.forEach((copy) => {
      copy.setAttribute('data-entry-state', 'presented');
      copy.dataset.entryState = 'presented';
      copy.setAttribute('data-timeline-reason', reason);
      claimRevealWithin(copy, { owner: 'timeline', state: 'presented' });
    });
    clearFixedCopies(copies, { clearStyle: true });
    if (activeFixedJoinId === join.id) activeFixedJoinId = '';

    const presentedState = forcePresentedState(join, stateByJoinId.get(join.id));
    stateByJoinId.set(join.id, presentedState);
    committedJoinIds.add(join.id);
    presentedJoinIds.add(join.id);

    const frame = createFrameFromState(join, presentedState, {
      direction: directionByJoinId.get(join.id) ?? 1,
      phase: 'presented',
      copyOwner: 'native',
      visualOwner: 'native',
      interactionOwner: 'native'
    });
    lastFrameByJoinId.set(join.id, frame);
    dispatchPresented(root, { joinId: join.id, reason });
    return frame;
  }

  function cleanupJoin(joinId, reason = 'cleanup-join') {
    const join = resolveJoin(joinId);
    if (!join) return null;
    const scene = sceneById.get(join.toScene);
    const section = getSceneSection(root, scene);
    const copies = getSceneCopyTargets(root, scene);
    clearFixedCopies(copies, { clearStyle: !presentedJoinIds.has(join.id) });
    if (activeFixedJoinId === join.id) activeFixedJoinId = '';
    if (activeJoinId === join.id) activeJoinId = '';
    if (!presentedJoinIds.has(join.id)) committedJoinIds.delete(join.id);
    section?.removeAttribute('data-timeline-active-join');

    const state = stateByJoinId.get(join.id) || deriveTimelineState(join, 0);
    const frame = createFrameFromState(join, state, {
      direction: directionByJoinId.get(join.id) ?? 0,
      phase: 'released',
      copyOwner: presentedJoinIds.has(join.id) ? 'native' : 'hidden',
      visualOwner: presentedJoinIds.has(join.id) ? 'native' : 'adapter',
      interactionOwner: presentedJoinIds.has(join.id) ? 'native' : 'none'
    });
    lastFrameByJoinId.set(join.id, frame);

    copies.forEach((copy) => copy.setAttribute('data-timeline-reason', reason));
    return frame;
  }

  function updateFrameForJoin(join, progress, { milestones = {}, reason = 'update', direction } = {}, { autoPresent = true } = {}) {
    if (!join) return null;
    if (!activeJoinId) activeJoinId = join.id;
    const frameDirection = direction ?? directionByJoinId.get(join.id) ?? 1;
    directionByJoinId.set(join.id, normalizeDirection(frameDirection));

    if (presentedJoinIds.has(join.id) && normalizeDirection(frameDirection) >= 0) {
      return lastFrameByJoinId.get(join.id) || null;
    }

    const state = deriveTimelineState(join, progress, milestones);
    stateByJoinId.set(join.id, state);
    const frame = createFrameFromState(join, state, { direction: frameDirection });
    lastFrameByJoinId.set(join.id, frame);

    const scene = sceneById.get(join.toScene);
    const section = getSceneSection(root, scene);
    const copies = getSceneCopyTargets(root, scene);
    section?.style?.setProperty('--timeline-target-opacity', state.targetOpacity.toFixed(4));
    section?.setAttribute('data-timeline-active-join', join.id);
    copies.forEach((copy) => {
      syncTimelineCopyStyle(copy, state);
      copy.setAttribute('data-timeline-reason', reason);
    });

    const fixTargetCopy = shouldFixTargetCopy(join)
      && state.progress > 0.001
      && state.progress < 0.998
      && !(state.cleanupReady && isSectionInReleaseRange(section));
    if (fixTargetCopy) {
      if (activeFixedJoinId && activeFixedJoinId !== join.id) clearAllFixedCopies({ clearStyle: true });
      activeFixedJoinId = join.id;
      copies.forEach((copy) => setFixedCopy(copy, true));
    } else {
      clearFixedCopies(copies);
      if (activeFixedJoinId === join.id) activeFixedJoinId = '';
      if (state.cleanupReady || state.progress <= 0.001) {
        section?.removeAttribute('data-timeline-active-join');
      }
    }

    if (state.targetCommitted && !committedJoinIds.has(join.id)) commitTarget(join.id, reason);
    if (autoPresent && state.targetPresented) {
      const presentedFrame = presentTarget(join.id, reason);
      return state.cleanupReady ? cleanupJoin(join.id, reason) : presentedFrame;
    }
    if (state.cleanupReady) return cleanupJoin(join.id, reason);
    return lastFrameByJoinId.get(join.id) || frame;
  }

  function updateFrame(joinId, progress, options = {}) {
    return updateFrameForJoin(resolveJoin(joinId), progress, options);
  }

  function update(join, progress, options = {}) {
    return updateFrame(join, progress, options);
  }

  function getFrame(joinId) {
    const join = resolveJoin(joinId);
    return join ? lastFrameByJoinId.get(join.id) || null : null;
  }

  function createAdapterContext(host) {
    const join = getJoinForHost(host);

    return Object.freeze({
      join,
      getState() {
        return join ? stateByJoinId.get(join.id) || deriveTimelineState(join, 0) : null;
      },
      getFrame() {
        return join ? getFrame(join.id) : null;
      },
      update(progress, options) {
        return updateFrame(join, progress, options);
      },
      commit(reason = 'adapter-commit') {
        return join ? commitTarget(join.id, reason) : null;
      },
      present(reason = 'adapter-present') {
        return join ? presentTarget(join.id, reason) : null;
      },
      complete(reason = 'adapter-complete') {
        if (!join) return null;
        updateFrameForJoin(join, 1, { reason }, { autoPresent: false });
        return presentTarget(join.id, reason);
      }
    });
  }

  return Object.freeze({
    getJoinForHost,
    createAdapterContext,
    getState(joinId) {
      const join = resolveJoin(joinId);
      return join ? stateByJoinId.get(join.id) || null : null;
    },
    getFrame,
    beginJoin,
    updateFrame,
    commitTarget,
    presentTarget,
    cleanupJoin,
    update
  });
}
