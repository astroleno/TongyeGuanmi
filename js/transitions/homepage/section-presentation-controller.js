function getQueryRoot(root) {
  return typeof root?.querySelector === 'function' ? root : document;
}

function resolveSection(root, sectionId) {
  if (!sectionId) return null;
  const queryRoot = getQueryRoot(root);
  return queryRoot.getElementById?.(sectionId)
    || queryRoot.querySelector?.(`[data-section-id="${sectionId}"]`)
    || null;
}

function sectionIdFromTarget(target) {
  return target?.dataset?.sectionId || target?.id || '';
}

function resolveTarget(root, sectionIdOrTarget) {
  return typeof sectionIdOrTarget === 'string'
    ? resolveSection(root, sectionIdOrTarget)
    : sectionIdOrTarget;
}

export function markSectionHandoffPreparing(target) {
  target?.setAttribute('data-section-handoff-state', 'transitioning-in');
}

export function markSectionHandoffPresented(target) {
  target?.setAttribute('data-section-handoff-state', 'presented');
}

export function markSectionScenePresented(target) {
  target?.setAttribute('data-scene-state', 'presented');
}

export function markSectionEntrySuppressed(target) {
  target?.setAttribute('data-section-entry-suppressed', 'true');
}

export function clearSectionEntrySuppressed(target) {
  target?.removeAttribute('data-section-entry-suppressed');
}

export function createSectionPresentationController({ root = document } = {}) {
  return Object.freeze({
    markHandoffPreparing(sectionIdOrTarget) {
      markSectionHandoffPreparing(resolveTarget(root, sectionIdOrTarget));
    },

    markHandoffPresented(sectionIdOrTarget) {
      markSectionHandoffPresented(resolveTarget(root, sectionIdOrTarget));
    },

    markScenePresented(sectionIdOrTarget) {
      markSectionScenePresented(resolveTarget(root, sectionIdOrTarget));
    },

    suppressEntryOnce(sectionIdOrTarget) {
      markSectionEntrySuppressed(resolveTarget(root, sectionIdOrTarget));
    },

    clearEntrySuppression(sectionIdOrTarget) {
      clearSectionEntrySuppressed(resolveTarget(root, sectionIdOrTarget));
    },

    getSectionId(sectionIdOrTarget) {
      return typeof sectionIdOrTarget === 'string'
        ? sectionIdOrTarget
        : sectionIdFromTarget(sectionIdOrTarget);
    },

    clear() {}
  });
}
