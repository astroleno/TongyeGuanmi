export const STATIC_READING_SELECTOR = '.static-content__main';

/** Hand the document back to the build-time reading surface without reloading. */
export function activateStaticReading(): void {
  document.getElementById('story-loader-static')?.remove();
  const documentElement = document.documentElement;
  delete documentElement.dataset.phonePreboot;
  delete documentElement.dataset.storyHydrated;
  documentElement.dataset.staticReading = 'true';

  window.requestAnimationFrame(() => {
    for (const owner of [document.scrollingElement, documentElement, document.body]) {
      if (owner) owner.scrollTop = 0;
    }
    document.querySelector<HTMLElement>(STATIC_READING_SELECTOR)?.focus({
      preventScroll: true
    });
  });
}
