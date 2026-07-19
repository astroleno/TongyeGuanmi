import copyReference from '../../../docs/react-refactor/inventory/copy-reference.json';

export type ProductCopySectionId = 'home' | 'belief' | 'method';

export function productCopyFor(sectionId: ProductCopySectionId): readonly string[] {
  const section = copyReference.sections.find((candidate) => candidate.sectionId === sectionId);
  if (!section) {
    throw new Error(`Missing canonical copy section: ${sectionId}`);
  }
  return section.normalizedText;
}

export const HOME_COPY = productCopyFor('home');
export const BELIEF_COPY = productCopyFor('belief');
export const METHOD_COPY = productCopyFor('method');
export const STAR_MAP_TITLE = '让 AI 成为真利器';
