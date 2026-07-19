import copyReference from '../../../../docs/react-refactor/inventory/copy-reference.json';

function sectionCopy(sectionId: string): readonly string[] {
  const section = copyReference.sections.find((candidate) => candidate.sectionId === sectionId);
  if (!section) {
    throw new Error(`Missing canonical copy section: ${sectionId}`);
  }
  return section.normalizedText;
}

// Keep the spike tied to the same inventory that feeds the production
// manifest/static fallback. It must not become a second copy source.
export const PORTRAIT_SPIKE_HOME_COPY = sectionCopy('home');
export const PORTRAIT_SPIKE_BELIEF_COPY = sectionCopy('belief');
export const PORTRAIT_SPIKE_METHOD_COPY = sectionCopy('method');
