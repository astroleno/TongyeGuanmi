import { mountInkbleedGoo } from './components/inkbleed-goo.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const note = document.querySelector('[data-inkbleed-note]');

document.querySelectorAll('[data-inkbleed-goo]').forEach((host) => {
  const effect = mountInkbleedGoo({ host, reducedMotion });
  if (!effect) return;

  if (host.dataset.inkbleedMode === 'desktop') {
    bindDesktopInkbleed(host, effect);
  } else if (host.dataset.inkbleedMode === 'touch') {
    bindTouchInkbleed(host, effect);
  }
});

if (reducedMotion && note) {
  note.textContent = '当前设备启用了“减少动态效果”：两段文字均保留为静态字形。';
} else if (!hasFineHover && note) {
  note.textContent = '当前设备没有细指针：桌面示例保持静态；可在下方按住体验同一套局部 Ink 扩散效果。';
}

function bindDesktopInkbleed(host, effect) {
  if (!hasFineHover) {
    host.dataset.inkbleedState = 'static';
    return;
  }

  host.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    effect.setPointer(event.clientX, event.clientY);
  });
  host.addEventListener('pointerleave', () => effect.release());
}

function bindTouchInkbleed(host, effect) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;

  const release = () => {
    if (pointerId === null) return;
    pointerId = null;
    host.classList.remove('is-ink-pressed');
    effect.release();
  };

  host.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    host.classList.add('is-ink-pressed');
    host.setPointerCapture?.(pointerId);
    effect.setPointer(event.clientX, event.clientY);
  });

  host.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;

    const horizontalDistance = Math.abs(event.clientX - startX);
    const verticalDistance = Math.abs(event.clientY - startY);
    if (event.pointerType !== 'mouse' && verticalDistance > 16 && verticalDistance > horizontalDistance) {
      release();
      return;
    }

    effect.setPointer(event.clientX, event.clientY);
  });

  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);
  host.addEventListener('lostpointercapture', release);
}
