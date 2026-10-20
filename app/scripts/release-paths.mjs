export function releaseBasePath(value = process.env.R5_BASE_PATH) {
  const base = value?.trim() || '/';
  if (!['/', '/experience/'].includes(base)) throw new Error('R5_BASE_PATH must be / or /experience/');
  return base;
}

export function localReleaseAssetPath(href, base = releaseBasePath()) {
  const url = new URL(href, 'https://release.invalid/');
  if (url.origin !== 'https://release.invalid' || !url.pathname.startsWith(base)) {
    throw new Error(`asset URL is outside the compiled release mount: ${href}`);
  }
  const relative = decodeURIComponent(url.pathname.slice(base.length));
  if (!relative || relative.startsWith('/') || relative.split('/').includes('..')) {
    throw new Error(`asset URL is not a safe emitted path: ${href}`);
  }
  return relative;
}
