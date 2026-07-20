type PhoneLoaderDocumentState = { completed: boolean };
type PhoneLoaderStore = Pick<Storage, 'removeItem' | 'setItem'>;
type PhoneVisibilityDocument = Pick<Document, 'addEventListener' | 'hidden' | 'removeEventListener'>;

const currentDocumentState: PhoneLoaderDocumentState = { completed: false };

// The HTML recovery gate remains the v16 gate while the complete spike is
// moved into the production phone shell. Keep this identity aligned so a
// lock-screen recovery does not produce a contradictory Loader/Hero state.
export const PHONE_LOADER_COMPLETE_KEY = 'tongye:portrait-spike:v16:loader-complete';
export const PHONE_LOADER_HIDDEN_AT_KEY = 'tongye:portrait-spike:v16:hidden-at';

function browserStore(): PhoneLoaderStore | undefined {
  if (typeof window === 'undefined') return undefined;
  try { return window.sessionStorage; } catch { return undefined; }
}

export function phoneLoaderCompletedInDocument(
  state: PhoneLoaderDocumentState = currentDocumentState,
  resumeMarked = typeof document !== 'undefined'
    && document.documentElement.dataset.portraitLoaderResume === 'skip'
): boolean {
  if (resumeMarked) state.completed = true;
  return state.completed;
}

export function markPhoneLoaderCompletedInDocument(
  state: PhoneLoaderDocumentState = currentDocumentState,
  store: PhoneLoaderStore | undefined = browserStore()
): void {
  state.completed = true;
  try { store?.setItem(PHONE_LOADER_COMPLETE_KEY, 'true'); } catch { /* in-document state remains authoritative */ }
}

export function attachPhoneLoaderVisibilityLifecycle(
  state: PhoneLoaderDocumentState = currentDocumentState,
  store: PhoneLoaderStore | undefined = browserStore(),
  visibilityDocument: PhoneVisibilityDocument | undefined = typeof document === 'undefined' ? undefined : document,
  now: () => number = Date.now
): () => void {
  const onVisibilityChange = () => {
    if (!state.completed) return;
    try {
      if (visibilityDocument?.hidden) store?.setItem(PHONE_LOADER_HIDDEN_AT_KEY, String(now()));
      else store?.removeItem(PHONE_LOADER_HIDDEN_AT_KEY);
    } catch { /* recovery does not depend on storage */ }
  };
  visibilityDocument?.addEventListener('visibilitychange', onVisibilityChange);
  if (visibilityDocument?.hidden) onVisibilityChange();
  return () => visibilityDocument?.removeEventListener('visibilitychange', onVisibilityChange);
}
