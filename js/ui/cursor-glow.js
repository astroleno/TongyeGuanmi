const defaultLerp = (a, b, t) => a + (b - a) * t;

export function initCursorGlow({
  root = document.documentElement,
  reduceMotion = false,
  lerp = defaultLerp
} = {}) {
  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let cx = tx;
  let cy = ty;

  window.addEventListener('pointermove', (event) => {
    tx = event.clientX;
    ty = event.clientY;
    root.style.setProperty('--cursor-x', `${tx}px`);
    root.style.setProperty('--cursor-y', `${ty}px`);
  }, { passive: true });

  function tick() {
    cx = lerp(cx, tx, 0.11);
    cy = lerp(cy, ty, 0.11);
    root.style.setProperty('--cursor-x', `${cx}px`);
    root.style.setProperty('--cursor-y', `${cy}px`);
    requestAnimationFrame(tick);
  }
  if (!reduceMotion) tick();
}
