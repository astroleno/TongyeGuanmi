/** The compiled story owns only its mount, not a future independent homepage. */
export const STORY_BASE_PATH = import.meta.env.BASE_URL;

export function storyPath(relative = '', base = STORY_BASE_PATH): string {
  return `${base}${relative}`;
}

export function storyLocalPath(pathname: string, base = STORY_BASE_PATH): string | null {
  if (base === '/') return pathname;
  return pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : null;
}
