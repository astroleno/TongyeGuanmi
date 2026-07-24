export type PhoneStoryFallbackReason = 'shell-error' | 'startup-timeout';

/**
 * A phone presentation failure must never leave the preboot cover owning the
 * document. The static story is already present after #root, so releasing the
 * phone route marker restores a readable, scrollable page without a reload.
 */
export function revealStaticPhoneStoryFallback(
  reason: PhoneStoryFallbackReason
): void {
  if (typeof document === 'undefined') return;
  const documentElement = document.documentElement;
  document.getElementById('story-loader-static')?.remove();
  delete documentElement.dataset.portraitSpike;
  delete documentElement.dataset.portraitSpikeMotion;
  delete documentElement.dataset.portraitSpikePreboot;
  delete documentElement.dataset.portraitSpikeLoader;
  delete documentElement.dataset.storyHydrated;
  documentElement.dataset.phoneStoryFallback = reason;
  documentElement.style.removeProperty('--portrait-document-surface');
}
