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
  canvas: HTMLCanvasElement;
  active: ActiveClaim | undefined;
};

const pools = new WeakMap<Document, PhoneInkSurfacePool>();

function createPool(document: Document): PhoneInkSurfacePool {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  return {
    canvas,
    active: undefined
  };
}

function hide(canvas: HTMLCanvasElement): void {
  canvas.style.visibility = 'hidden';
  canvas.style.opacity = '0';
}

/**
 * The phone story owns one movable ink surface for the whole document. Each
 * boundary rebuilds only its GPU program/field on the same WebGL context; an
 * endpoint returns that surface to the pool and reverse acquires it again.
 */
export function claimPhoneInkSurface(
  document: Document,
  claim: PhoneInkSurfaceClaim
): PhoneInkSurfaceLease {
  const pool = pools.get(document) ?? createPool(document);
  pools.set(document, pool);
  const token = Symbol();
  const active = pool.active;
  if (active) {
    pool.active = undefined;
    active.onRevoke();
  }
  pool.active = { ...claim, token };
  pool.canvas.className = claim.className;
  if (claim.portraitInk) {
    pool.canvas.dataset.portraitInk = claim.portraitInk;
  } else {
    delete pool.canvas.dataset.portraitInk;
  }
  claim.host.append(pool.canvas);
  return {
    canvas: pool.canvas,
    release() {
      if (pool.active?.token !== token) return;
      pool.active = undefined;
      claim.onRevoke();
      hide(pool.canvas);
    }
  };
}
