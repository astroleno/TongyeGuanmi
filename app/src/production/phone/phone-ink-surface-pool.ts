type PhoneInkSurfaceClaim = Readonly<{
  host: HTMLElement;
  className: string;
  portraitInk?: string;
  onRevoke(): void;
}>;

export type PhoneInkSurfaceLease = Readonly<{
  canvas: HTMLCanvasElement;
  release(): void;
}>;

type ActiveClaim = PhoneInkSurfaceClaim & Readonly<{ token: symbol }>;

type PhoneInkSurfacePool = {
  canvas: HTMLCanvasElement | undefined;
  active: ActiveClaim | undefined;
};

const pools = new WeakMap<Document, PhoneInkSurfacePool>();

function createPool(): PhoneInkSurfacePool {
  return {
    canvas: undefined,
    active: undefined
  };
}

function createCanvas(document: Document): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

function retireCanvas(pool: PhoneInkSurfacePool): void {
  const canvas = pool.canvas;
  if (!canvas) return;
  canvas.style.visibility = 'hidden';
  canvas.style.opacity = '0';
  canvas.remove();
  pool.canvas = undefined;
}

/**
 * The phone story owns one active ink surface for the whole document. Each
 * boundary gets a fresh canvas lease so releasing a WebGL renderer retires
 * the DOM node and its context together. A later reverse leg acquires a new
 * surface instead of reviving a stale React or WebGL owner.
 */
export function claimPhoneInkSurface(
  document: Document,
  claim: PhoneInkSurfaceClaim
): PhoneInkSurfaceLease {
  const pool = pools.get(document) ?? createPool();
  pools.set(document, pool);
  const token = Symbol();
  const active = pool.active;
  if (active) {
    pool.active = undefined;
    active.onRevoke();
    retireCanvas(pool);
  }
  const canvas = pool.canvas ?? createCanvas(document);
  pool.canvas = canvas;
  pool.active = { ...claim, token };
  canvas.className = claim.className;
  if (claim.portraitInk) {
    canvas.dataset.portraitInk = claim.portraitInk;
  } else {
    delete canvas.dataset.portraitInk;
  }
  claim.host.append(canvas);
  return {
    canvas,
    release() {
      if (pool.active?.token !== token) return;
      pool.active = undefined;
      claim.onRevoke();
      retireCanvas(pool);
    }
  };
}
