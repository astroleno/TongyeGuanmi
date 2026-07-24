import { phoneGroup67EntryPlanFromHash } from './phone/phone-entry-plan';

/** Load only the selected presentation family. */
export function loadDesktopStoryShell() {
  return import('./desktop/DesktopStoryShell').then(({ DesktopStoryShell }) => ({
    default: DesktopStoryShell
  }));
}

/**
 * Resolve the thin shell as soon as its animated Loader adapter is available.
 * The mounted shell owns the remaining Loader → Method preparation, so the
 * pre-hydration cover never impersonates or blocks the authored Loader.
 */
export async function loadPhoneStoryShell(
  hash = typeof window === 'undefined' ? '' : window.location.hash
) {
  const directGroup67Entry = phoneGroup67EntryPlanFromHash(hash);
  const [shell] = await Promise.all([
    import('./phone/PhoneStoryShell'),
    directGroup67Entry
      ? Promise.resolve(undefined)
      : import('./phone/module-loaders')
        .then(({ loadPhoneLoaderAdapter }) => loadPhoneLoaderAdapter())
        .catch(() => undefined)
  ]);
  return { default: shell.PhoneStoryShell };
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
