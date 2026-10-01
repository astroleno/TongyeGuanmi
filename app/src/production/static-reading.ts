/** Hand the document back to the build-time reading surface without reloading. */
export function activateStaticReading(): void {
  document.getElementById('story-loader-static')?.remove();
  const documentElement = document.documentElement;
  delete documentElement.dataset.phonePreboot;
  delete documentElement.dataset.storyHydrated;
  documentElement.dataset.staticReading = 'true';
  const root = document.getElementById('root');
  if (root) root.hidden = true;
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  document.querySelector<HTMLElement>('.static-content__main')?.focus({ preventScroll: true });
}
