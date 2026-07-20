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
export async function loadPhoneStoryShell() {
  const [shell] = await Promise.all([
    import('./phone/PhoneStoryShell'),
    import('./phone/module-loaders')
      .then(({
        loadPhoneLoaderAdapter,
        loadPhoneSceneAdapter,
        loadPhoneTransitionAdapter,
        phoneSceneAdapterIds,
        phoneTransitionAdapterIds
      }) => Promise.all([
        loadPhoneLoaderAdapter(),
        ...phoneSceneAdapterIds.map(loadPhoneSceneAdapter),
        ...phoneTransitionAdapterIds.map(loadPhoneTransitionAdapter)
      ]))
      .catch(() => undefined)
  ]);
  return { default: shell.PhoneStoryShell };
}
