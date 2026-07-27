import type {
  PhoneBoundaryGeometryOwner
} from './phone-boundary-geometry';

export type PhoneDocumentEndpointAlignmentLease = Readonly<{
  releaseGeometry(): void;
}>;

type AlignmentSnapshot = Readonly<{
  aligned: string | undefined;
  session: string | undefined;
  generation: string | undefined;
  translateY: string;
}>;

type DocumentAlignmentState = Readonly<{
  before: AlignmentSnapshot;
}>;

const documentState = new WeakMap<HTMLElement, DocumentAlignmentState>();
const documentTranslate = '--phone-document-endpoint-align-y';

function setDataset(
  dataset: DOMStringMap,
  key: keyof DOMStringMap,
  value: string | undefined
): void {
  if (value === undefined) delete dataset[key];
  else dataset[key] = value;
}

export function acquirePhoneDocumentEndpointAlignment(
  element: HTMLElement,
  owner: PhoneBoundaryGeometryOwner,
  viewportHeight = window.innerHeight
): PhoneDocumentEndpointAlignmentLease {
  const dataset = element.dataset;
  const style = element.style;
  const state: DocumentAlignmentState = {
    before: documentState.get(element)?.before ?? {
      aligned: dataset.phoneDocumentEndpointAligned,
      session: dataset.phoneBoundarySession,
      generation: dataset.phoneBoundaryGeneration,
      translateY: style.getPropertyValue(documentTranslate)
    }
  };
  documentState.set(element, state);
  const delta = viewportHeight - element.getBoundingClientRect().bottom;
  dataset.phoneDocumentEndpointAligned = 'true';
  dataset.phoneBoundarySession = owner.sessionId;
  dataset.phoneBoundaryGeneration = String(owner.generation);
  style.setProperty(documentTranslate, `${delta.toFixed(3)}px`);

  return {
    releaseGeometry() {
      if (documentState.get(element) !== state) return;
      documentState.delete(element);
      const { before } = state;
      setDataset(dataset, 'phoneDocumentEndpointAligned', before.aligned);
      setDataset(dataset, 'phoneBoundarySession', before.session);
      setDataset(dataset, 'phoneBoundaryGeneration', before.generation);
      if (before.translateY) style.setProperty(documentTranslate, before.translateY);
      else style.removeProperty(documentTranslate);
    }
  };
}
