/** Load only the selected presentation family. */
export function loadDesktopStoryShell() {
  return import('./desktop/DesktopStoryShell').then(({ DesktopStoryShell }) => ({
    default: DesktopStoryShell
  }));
}

/**
 * Start the initial Hero and its adjacent handoff beside the phone shell. The
 * shell import still resolves if either adapter chunk fails, so its Loader can
 * reveal the static document fallback instead of leaving Suspense pending.
 */
export async function loadPhoneStoryShell() {
  const [shell] = await Promise.all([
    import('./phone/PhoneStoryShell'),
    import('./phone/module-loaders')
      .then(({ loadPhoneSceneAdapter, loadPhoneTransitionAdapter }) => Promise.all([
        loadPhoneSceneAdapter('hero'),
        loadPhoneTransitionAdapter('hero-pattern')
      ]))
      .catch(() => undefined)
  ]);
  return { default: shell.PhoneStoryShell };
}
