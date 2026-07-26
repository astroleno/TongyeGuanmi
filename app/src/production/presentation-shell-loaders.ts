/** Load only the selected presentation family. */
export function loadDesktopStoryShell() {
  return import('./desktop/DesktopStoryShell').then(({ DesktopStoryShell }) => ({
    default: DesktopStoryShell
  }));
}

/** Resolve the lightweight Loader owner before the media-heavy phone shell. */
export function loadPhoneStoryShell(hash?: string) {
  // Entry selection remains inside the bootstrap and formal shell.
  void hash;
  return import('./phone/PhoneStoryBootstrap').then(({ PhoneStoryBootstrap }) => ({
    default: PhoneStoryBootstrap
  }));
}
