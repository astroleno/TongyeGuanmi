/** Load only the selected presentation family. */
export function loadDesktopStoryShell() {
  return import('./desktop/DesktopStoryShell').then(({ DesktopStoryShell }) => ({
    default: DesktopStoryShell
  }));
}

/**
 * Resolve the phone shell without waiting on a second lazy adapter request.
 * PhoneStoryShell owns the authored Loader synchronously; its mounted adapter
 * registry prepares Hero → Method behind that animation.
 */
export function loadPhoneStoryShell(hash?: string) {
  // Keep the explicit hash argument for direct-entry loader callers. Entry
  // selection now happens inside the shell instead of delaying its import.
  void hash;
  return import('./phone/PhoneStoryShell').then(({ PhoneStoryShell }) => ({
    default: PhoneStoryShell
  }));
}

/**
 * Dedicated physical-device acceptance entry. It does not preload any scene:
 * the v36 shell resolves Lab → Contact adapters only as their chapter is
 * reached, so direct #contact remains a cold terminal route.
 */
export function loadPhoneLabContactShell() {
  return import('./phone/PhoneLabContactShell').then(({
    PhoneLabContactShell
  }) => ({ default: PhoneLabContactShell }));
}
