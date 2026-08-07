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
  // Keep the pooled owner mounted between boundary leases. Removing a WebGL
  // canvas during every release makes WebKit retire the context before the
  // next claim can rebind it, which turns one route-level owner into a stream
  // of cumulative contexts. A later claim moves this same node to its new
  // host; terminal route teardown removes it with that host.
}

function contextWasLost(canvas: HTMLCanvasElement): boolean {
  const getContext = canvas.getContext?.bind(canvas) as
    | ((kind: string) => { isContextLost?: () => boolean } | null)
    | undefined;
  if (!getContext) return false;
  const context = getContext('webgl') ?? getContext('webgl2');
  return context?.isContextLost?.() === true;
}

/**
 * The phone story owns one active ink surface for the whole document. Boundary
 * leases only change the host and renderer resources; the detached canvas and
 * its WebGL context stay reusable for the next leg. A replacement is created
 * only after the browser has actually lost the pooled context.
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
  const canvas = pool.canvas && !contextWasLost(pool.canvas)
    ? pool.canvas
    : createCanvas(document);
  if (pool.canvas && canvas !== pool.canvas) {
    pool.canvas.remove();
  }
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
