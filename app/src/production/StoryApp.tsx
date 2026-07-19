/**
 * Backward-compatible desktop entry point.
 *
 * App composition now loads DesktopStoryShell lazily; keeping this export
 * avoids a disruptive import migration for desktop-only harnesses.
 */
export {
  DesktopStoryShell as StoryApp,
  type DesktopStoryShellApi as StoryAppApi,
  type DesktopStoryShellProps as StoryAppProps,
  type DesktopStoryShellSnapshot as StoryAppSnapshot
} from './desktop/DesktopStoryShell';
