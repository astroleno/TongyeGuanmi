type PhoneLoaderDocumentState = { completed: boolean };

const currentDocumentState: PhoneLoaderDocumentState = { completed: false };

export function phoneLoaderCompletedInDocument(
  state: PhoneLoaderDocumentState = currentDocumentState
): boolean {
  return state.completed;
}

export function markPhoneLoaderCompletedInDocument(
  state: PhoneLoaderDocumentState = currentDocumentState
): void {
  state.completed = true;
}
