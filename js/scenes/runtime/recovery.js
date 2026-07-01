export const RECOVERY_RELEASE_REASON = 'recovery';

function callMaybe(port, method, ...args) {
  if (typeof port?.[method] === 'function') return port[method](...args);
  if (typeof port === 'function' && method === 'call') return port(...args);
  return undefined;
}

export function createRecoveryRoutine({
  scrollLock = null,
  presentation = null,
  logger = null,
  onRecover = null
} = {}) {
  const history = [];

  function recover({
    activePlayer = null,
    timers = [],
    pendingMedia = [],
    targetScene = null,
    lastSafeScene = null,
    recoveryReason = 'unknown',
    error = null
  } = {}) {
    for (const timer of timers) {
      if (typeof timer === 'function') timer();
    }

    for (const media of pendingMedia) {
      callMaybe(media, 'pause');
      callMaybe(media, 'cancel');
      callMaybe(media, 'destroy');
    }

    callMaybe(activePlayer, 'stop', { reason: RECOVERY_RELEASE_REASON, recoveryReason });
    callMaybe(activePlayer, 'cancel', { reason: RECOVERY_RELEASE_REASON, recoveryReason });
    callMaybe(activePlayer, 'destroy');

    callMaybe(scrollLock, 'unlock', { reason: RECOVERY_RELEASE_REASON, recoveryReason, failOpen: true });

    const sceneToPresent = targetScene || lastSafeScene;
    if (sceneToPresent) {
      callMaybe(presentation, 'present', sceneToPresent, {
        reason: RECOVERY_RELEASE_REASON,
        recoveryReason,
        error
      });
    }

    const result = {
      reason: RECOVERY_RELEASE_REASON,
      recoveryReason,
      targetScene: sceneToPresent,
      error: error || null
    };
    history.push(result);
    onRecover?.(result);
    logger?.warn?.('SceneRuntime recovery routine completed.', result);
    return result;
  }

  return {
    recover,
    getHistory: () => history.slice()
  };
}
