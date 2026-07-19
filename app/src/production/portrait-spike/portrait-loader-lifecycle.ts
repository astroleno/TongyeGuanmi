type PortraitLoaderDocumentState = {
  completed: boolean;
};

type PortraitLoaderStore = Pick<Storage, 'removeItem' | 'setItem'>;

type PortraitVisibilityDocument = Pick<
  Document,
  'addEventListener' | 'hidden' | 'removeEventListener'
>;

const currentDocumentState: PortraitLoaderDocumentState = {
  completed: false
};

export const PORTRAIT_LOADER_COMPLETE_KEY = 'tongye:portrait-spike:v16:loader-complete';
export const PORTRAIT_LOADER_HIDDEN_AT_KEY = 'tongye:portrait-spike:v16:hidden-at';

function browserStore(): PortraitLoaderStore | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Completion normally lives only in the current JavaScript document. The
 * pre-hydration script may mark a short lock-screen recovery reload as `skip`;
 * a normal refresh has no such marker and therefore presents Loader again.
 */
export function portraitLoaderCompletedInDocument(
  state: PortraitLoaderDocumentState = currentDocumentState,
  resumeMarked = typeof document !== 'undefined'
    && document.documentElement.dataset.portraitLoaderResume === 'skip'
): boolean {
  if (resumeMarked) {
    state.completed = true;
  }
  return state.completed;
}

export function markPortraitLoaderCompletedInDocument(
  state: PortraitLoaderDocumentState = currentDocumentState,
  store: PortraitLoaderStore | undefined = browserStore()
): void {
  state.completed = true;
  try {
    store?.setItem(PORTRAIT_LOADER_COMPLETE_KEY, 'true');
  } catch {
    // The in-document state remains authoritative when storage is denied.
  }
}

export function attachPortraitLoaderVisibilityLifecycle(
  state: PortraitLoaderDocumentState = currentDocumentState,
  store: PortraitLoaderStore | undefined = browserStore(),
  visibilityDocument: PortraitVisibilityDocument | undefined = typeof document === 'undefined'
    ? undefined
    : document,
  now: () => number = Date.now
): () => void {
  const onVisibilityChange = () => {
    if (!state.completed) {
      return;
    }
    try {
      if (visibilityDocument?.hidden) {
        store?.setItem(PORTRAIT_LOADER_HIDDEN_AT_KEY, String(now()));
      } else {
        store?.removeItem(PORTRAIT_LOADER_HIDDEN_AT_KEY);
      }
    } catch {
      // Visibility recovery must not depend on storage availability.
    }
  };

  visibilityDocument?.addEventListener('visibilitychange', onVisibilityChange);
  if (visibilityDocument?.hidden) {
    onVisibilityChange();
  }
  return () => {
    visibilityDocument?.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
