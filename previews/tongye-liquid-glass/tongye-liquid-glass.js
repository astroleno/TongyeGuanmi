(() => {
  'use strict';

  const SELECTOR = '.tongye-glass';
  const supportsFinePointer = window.matchMedia('(pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) return;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function attachGlassMotion(el) {
    let raf = 0;
    let targetX = 0.5;
    let targetY = 0.18;

    const write = () => {
      raf = 0;
      const nx = (targetX - 0.5) * 2;
      const ny = (targetY - 0.5) * 2;
      el.style.setProperty('--glass-x', `${(targetX * 100).toFixed(2)}%`);
      el.style.setProperty('--glass-y', `${(targetY * 100).toFixed(2)}%`);
      el.style.setProperty('--glass-nx', clamp(nx, -1, 1).toFixed(3));
      el.style.setProperty('--glass-ny', clamp(ny, -1, 1).toFixed(3));
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };

    const reset = () => {
      targetX = 0.5;
      targetY = 0.18;
      el.dataset.glassActive = 'false';
      schedule();
    };

    if (supportsFinePointer) {
      el.addEventListener('pointermove', (event) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        targetX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        targetY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        el.dataset.glassActive = 'true';
        schedule();
      }, { passive: true });

      el.addEventListener('pointerleave', reset, { passive: true });
    }

    el.addEventListener('focusin', () => {
      el.dataset.glassActive = 'true';
    });

    el.addEventListener('focusout', reset);
  }

  function init() {
    document.querySelectorAll(SELECTOR).forEach(attachGlassMotion);
    attachScrollBackdrop();
  }

  function attachScrollBackdrop() {
    let raf = 0;

    const write = () => {
      raf = 0;
      const y = window.scrollY || 0;
      document.documentElement.style.setProperty('--material-shift', `${(-y * 0.075).toFixed(1)}px`);
      document.documentElement.style.setProperty('--material-counter-shift', `${(y * 0.045).toFixed(1)}px`);
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };

    write();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
