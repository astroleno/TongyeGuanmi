import {
  setRevealPresentedWithin,
  suppressRevealOnceWithin
} from '../../ui/reveal.js';

function resolveSection(root, sectionId) {
  if (!sectionId) return null;
  const queryRoot = typeof root?.querySelector === 'function' ? root : document;
  return queryRoot.getElementById?.(sectionId) || queryRoot.querySelector?.(`[data-section-id="${sectionId}"]`) || null;
}

function sectionIdFromTarget(target) {
  return target?.dataset?.sectionId || target?.id || '';
}

export function createSectionPresentationController({ root = document } = {}) {
  const presentedSections = new Set();
  const suppressedEntrySections = new Set();
  const activeHandoffs = new Map();

  return {
    beginHandoff(handoff) {
      if (!handoff?.id) return;
      activeHandoffs.set(handoff.id, handoff);
      const target = handoff.target || resolveSection(root, handoff.to);
      target?.setAttribute('data-section-handoff-state', 'transitioning-in');
    },

    markPresented(sectionIdOrTarget) {
      const target = typeof sectionIdOrTarget === 'string'
        ? resolveSection(root, sectionIdOrTarget)
        : sectionIdOrTarget;
      const sectionId = typeof sectionIdOrTarget === 'string'
        ? sectionIdOrTarget
        : sectionIdFromTarget(target);

      if (!target || !sectionId) return;
      presentedSections.add(sectionId);
      target.setAttribute('data-section-handoff-state', 'presented');
      setRevealPresentedWithin(target);
    },

    isPresented(sectionId) {
      return presentedSections.has(sectionId);
    },

    suppressEntryOnce(sectionIdOrTarget) {
      const target = typeof sectionIdOrTarget === 'string'
        ? resolveSection(root, sectionIdOrTarget)
        : sectionIdOrTarget;
      const sectionId = typeof sectionIdOrTarget === 'string'
        ? sectionIdOrTarget
        : sectionIdFromTarget(target);

      if (!target || !sectionId) return;
      suppressedEntrySections.add(sectionId);
      target.setAttribute('data-section-entry-suppressed', 'true');
      suppressRevealOnceWithin(target);
    },

    shouldSuppressEntry(sectionId) {
      if (!suppressedEntrySections.has(sectionId)) return false;
      suppressedEntrySections.delete(sectionId);
      const target = resolveSection(root, sectionId);
      target?.removeAttribute('data-section-entry-suppressed');
      return true;
    },

    completeHandoff(handoff) {
      if (!handoff?.to && !handoff?.target) return;
      const target = handoff.target || resolveSection(root, handoff.to);
      const sectionId = handoff.to || sectionIdFromTarget(target);
      if (!target || !sectionId) return;

      this.markPresented(target);
      if (handoff.suppressEntryOnce !== false) this.suppressEntryOnce(target);
      target.setAttribute('data-section-handoff-state', 'active');
      activeHandoffs.delete(handoff.id);
    },

    clear() {
      activeHandoffs.clear();
      presentedSections.clear();
      suppressedEntrySections.clear();
    }
  };
}
