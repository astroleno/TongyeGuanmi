import {
  createPatternSceneController,
  PATTERN_FINAL_PROGRESS,
  PATTERN_SOURCE_PROGRESS
} from './pattern-scene-controller.js';

export {
  PATTERN_FINAL_PROGRESS,
  PATTERN_SOURCE_PROGRESS
} from './pattern-scene-controller.js';

export const PATTERN_INITIAL_PROGRESS = PATTERN_SOURCE_PROGRESS;
export const PATTERN_POSTER_PROGRESS = PATTERN_FINAL_PROGRESS;

export function createPatternScenePlayer(options = {}) {
  const controller = createPatternSceneController(options);
  const traceHandlers = new Set();
  const unsubscribe = controller.subscribe((snapshot) => {
    for (const handler of traceHandlers) handler(snapshot);
  });

  function addTraceHandler(handler) {
    if (typeof handler === 'function') traceHandlers.add(handler);
  }

  function legacyRemovedPosterCommand() {
    return {
      accepted: false,
      completed: false,
      deprecated: true,
      reason: 'removed_ambiguous_poster'
    };
  }

  return {
    mount({ host, signal, onTrace } = {}) {
      addTraceHandler(onTrace);
      return controller.mount({ host, signal });
    },

    playForward(options = {}) {
      addTraceHandler(options.onTrace);
      return controller.playForward(options);
    },

    cancelToSource(options = {}) {
      addTraceHandler(options.onTrace);
      return controller.cancelToSource(options);
    },

    cancelToFinal(options = {}) {
      addTraceHandler(options.onTrace);
      return controller.cancelToFinal(options);
    },

    cancelToPoster(options = {}) {
      addTraceHandler(options.onTrace);
      return controller.cancelToFinal(options);
    },

    reverseToSource(options = {}) {
      addTraceHandler(options.onTrace);
      return controller.reverseToSource(options);
    },

    reverseToPoster() {
      return legacyRemovedPosterCommand();
    },

    showFinal(options = {}) {
      addTraceHandler(options.onTrace);
      return controller.showFinal(options);
    },

    showPoster(options = {}) {
      addTraceHandler(options.onTrace);
      return controller.showFinal(options);
    },

    destroy() {
      unsubscribe();
      return controller.destroy();
    },

    dispatch(command, options) {
      return controller.dispatch(command, options);
    },

    subscribe(fn) {
      return controller.subscribe(fn);
    },

    getState() {
      return controller.getState();
    }
  };
}
