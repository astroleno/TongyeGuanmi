import { phoneGroup67EntryPlanFromHash } from './phone/phone-entry-plan';

/** Load only the selected presentation family. */
export function loadDesktopStoryShell() {
  return import('./desktop/DesktopStoryShell').then(({ DesktopStoryShell }) => ({
    default: DesktopStoryShell
  }));
}

/**
 * Load the selected phone front-half adapter group beside its thin shell.
 * These chunks remain absent from desktop startup. The shell still resolves
 * after an adapter failure so Loader can release the static document fallback.
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
        .then(({
          loadPhoneLoaderAdapter,
          loadPhoneSceneAdapter,
          loadPhoneTransitionAdapter,
          initialPhoneSceneAdapterIds,
          initialPhoneTransitionAdapterIds
        }) => Promise.all([
          loadPhoneLoaderAdapter(),
          ...initialPhoneSceneAdapterIds.map(loadPhoneSceneAdapter),
          ...initialPhoneTransitionAdapterIds.map(loadPhoneTransitionAdapter)
        ]))
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
