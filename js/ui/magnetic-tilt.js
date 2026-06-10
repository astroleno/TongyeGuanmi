export function initMagneticAndTilt({ reduceMotion = false } = {}) {
  const supportsGsap = Boolean(window.gsap);

  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      if (supportsGsap && !reduceMotion) {
        window.gsap.to(el, { x: x * 0.22, y: y * 0.28, duration: 0.45, ease: 'power3.out' });
      } else {
        el.style.transform = `translate3d(${x * 0.12}px, ${y * 0.12}px, 0)`;
      }
    });

    el.addEventListener('pointerleave', () => {
      if (supportsGsap && !reduceMotion) {
        window.gsap.to(el, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1, .5)' });
      } else {
        el.style.transform = 'translate3d(0,0,0)';
      }
    });
  });

  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      if (reduceMotion) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const transform = `perspective(900px) rotateX(${-y * 7}deg) rotateY(${x * 8}deg) translate3d(0,-4px,0)`;
      if (supportsGsap) {
        window.gsap.to(card, { rotateX: -y * 7, rotateY: x * 8, y: -4, transformPerspective: 900, duration: 0.45, ease: 'power3.out' });
      } else {
        card.style.transform = transform;
      }
    });

    card.addEventListener('pointerleave', () => {
      if (supportsGsap && !reduceMotion) {
        window.gsap.to(card, { rotateX: 0, rotateY: 0, y: 0, duration: 0.75, ease: 'power3.out' });
      } else {
        card.style.transform = 'none';
      }
    });
  });
}
