import { permitsSpeculativeMedia } from './loading-policy';

const MAX_WARM_IMAGES = 12;
const MAX_DECODED_BYTES = 24 * 1024 * 1024;
type Entry = { image: HTMLImageElement | null; bytes: number; ready: Promise<void> };
const warmImages = new Map<string, Entry>();
let queue = Promise.resolve();

function trim(except?: Entry): void {
  let bytes = [...warmImages.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  for (const [url, entry] of warmImages) {
    if (bytes <= MAX_DECODED_BYTES && warmImages.size <= MAX_WARM_IMAGES) break;
    if (entry === except || !entry.image) continue;
    bytes -= entry.bytes;
    entry.image = null;
    warmImages.delete(url);
  }
}

/** One low-priority request/decode at a time; required scene loads never wait here. */
export function prewarmImages(urls: readonly string[]): Promise<void> {
  if (typeof Image === 'undefined' || !permitsSpeculativeMedia()) return Promise.resolve();
  return Promise.all(urls.map((url) => {
    const cached = warmImages.get(url);
    if (cached) {
      warmImages.delete(url);
      warmImages.set(url, cached);
      return cached.ready;
    }
    const entry: Entry = { image: null, bytes: 0, ready: Promise.resolve() };
    entry.ready = queue.then(async () => {
      if (!permitsSpeculativeMedia()) { warmImages.delete(url); return; }
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.fetchPriority = 'low';
      entry.image = image;
      await new Promise<void>((resolve, reject) => {
        const clear = () => { globalThis.clearTimeout(timer); image.onload = image.onerror = null; };
        const timer = globalThis.setTimeout(() => {
          clear(); image.src = ''; reject();
        }, 6000);
        image.onload = () => { clear(); resolve(); };
        image.onerror = () => { clear(); reject(); };
        image.src = url;
      });
      entry.bytes = image.naturalWidth * image.naturalHeight * 4;
      if (entry.bytes > MAX_DECODED_BYTES) { entry.image = null; warmImages.delete(url); return; }
      trim(entry);
      await image.decode?.();
    }).catch(() => {
      entry.image = null;
      if (warmImages.get(url) === entry) warmImages.delete(url);
      // Best-effort work cannot poison the scene registry or block its retry.
    });
    queue = entry.ready;
    warmImages.set(url, entry);
    return entry.ready;
  })).then(() => undefined);
}
