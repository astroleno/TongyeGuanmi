const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const READ_EVENTS = {
  ENTERED: 'READ_ENTERED',
  ACTIVE: 'READ_ACTIVE',
  COMPLETE_LATCHED: 'READ_COMPLETE_LATCHED',
  ARM_NEXT_READY: 'ARM_NEXT_READY',
  HASH_JUMP: 'HASH_JUMP'
};

export function createReadMonitor({
  sceneId,
  nextSegmentId,
  boundsProvider,
  viewportProvider,
  intentThresholdVh = 10
} = {}) {
  if (!sceneId) throw new Error('ReadMonitor requires sceneId');
  if (typeof boundsProvider !== 'function') throw new Error('ReadMonitor requires a fake boundsProvider');
  if (typeof viewportProvider !== 'function') throw new Error('ReadMonitor requires a fake viewportProvider');

  let boundsVersion = 0;
  let entered = false;
  let completeLatched = false;
  let armReady = false;
  let suspendedByHashJump = false;

  function event(type, details = {}) {
    return { type, sceneId, boundsVersion, ...details };
  }

  function refreshBounds() {
    boundsVersion += 1;
    return boundsVersion;
  }

  function update({ forwardIntentVh = 0 } = {}) {
    if (suspendedByHashJump) return [];

    const bounds = boundsProvider(sceneId, boundsVersion);
    const viewport = viewportProvider();
    const viewportTop = viewport.top ?? 0;
    const viewportHeight = Math.max(1, viewport.height ?? 1);
    const viewportCenter = viewportTop + viewportHeight / 2;
    const viewportBottom = viewportTop + viewportHeight;
    const top = bounds.top;
    const bottom = bounds.bottom;
    const height = Math.max(1, bottom - top);
    const progress = clamp((viewportBottom - top) / height);
    const events = [];

    if (!entered && top <= viewportCenter && bottom > viewportTop) {
      entered = true;
      events.push(event(READ_EVENTS.ENTERED));
    }

    if (entered) {
      events.push(event(READ_EVENTS.ACTIVE, { progress }));
    }

    const latchedThisUpdate = !completeLatched && bottom <= viewportBottom;
    if (latchedThisUpdate) {
      completeLatched = true;
      events.push(event(READ_EVENTS.COMPLETE_LATCHED));
    }

    if (
      completeLatched
      && !latchedThisUpdate
      && !armReady
      && forwardIntentVh >= intentThresholdVh
    ) {
      armReady = true;
      events.push(event(READ_EVENTS.ARM_NEXT_READY, { nextSegmentId }));
    }

    return events;
  }

  function hashJump(targetSceneId) {
    suspendedByHashJump = true;
    entered = false;
    completeLatched = false;
    armReady = false;
    return [event(READ_EVENTS.HASH_JUMP, { targetSceneId })];
  }

  function resetForScene() {
    suspendedByHashJump = false;
    entered = false;
    completeLatched = false;
    armReady = false;
  }

  return {
    update,
    refreshBounds,
    hashJump,
    resetForScene,
    getState: () => ({
      sceneId,
      nextSegmentId,
      boundsVersion,
      entered,
      completeLatched,
      armReady,
      suspendedByHashJump
    })
  };
}
