import { mountInkbleedGoo } from './components/inkbleed-goo.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const note = document.querySelector('[data-font-matrix-note]');

document.querySelectorAll('[data-inkbleed-goo]').forEach((host) => {
  const effect = mountInkbleedGoo({ host, reducedMotion });
  if (!effect) return;

  if (hasFineHover) {
    bindHover(host, effect);
  } else {
    bindPress(host, effect);
  }
});

if (reducedMotion && note) {
  note.textContent = '当前设备启用了“减少动态效果”：三套字体均保留为静态字形。';
} else if (!hasFineHover && note) {
  note.textContent = '当前设备没有细指针：按住并水平拖动各组文字，体验局部 Ink 扩散或字形边缘锚定的随机墨迹；纵向拖动会立即让出页面滚动。';
}

function bindHover(host, effect) {
  host.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') effect.setPointer(event.clientX, event.clientY);
  });
  host.addEventListener('pointerleave', () => effect.release());
}

function bindPress(host, effect) {
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
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    host.classList.add('is-ink-pressed');
    host.setPointerCapture?.(pointerId);
    effect.setPointer(event.clientX, event.clientY);
  });

  host.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const x = Math.abs(event.clientX - startX);
    const y = Math.abs(event.clientY - startY);
    if (event.pointerType !== 'mouse' && y > 16 && y > x) {
      release();
      return;
    }
    effect.setPointer(event.clientX, event.clientY);
  });

  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);
  host.addEventListener('lostpointercapture', release);
}
