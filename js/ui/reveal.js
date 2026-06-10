export function initVanillaReveal() {
  const items = [...document.querySelectorAll('.reveal')];
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

  items.forEach((item) => observer.observe(item));
}

export function initGsapTextAndUI({ root = document.documentElement } = {}) {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  gsap.set('.reveal', { autoAlpha: 0, y: 64, rotateX: 3, transformPerspective: 800 });
  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      rotateX: 0,
      duration: 1.15,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 84%',
        end: 'bottom 20%',
        toggleActions: 'play none none reverse'
      }
    });
  });

  const sections = ['method', 'services', 'education', 'contact'];
  sections.forEach((id) => {
    const section = document.getElementById(id);
    const nav = document.querySelector(`.nav-links a[href="#${id}"]`);
    if (!section || !nav) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top center',
      end: 'bottom center',
      onToggle: (self) => nav.classList.toggle('is-active', self.isActive)
    });
  });

  ScrollTrigger.create({
    trigger: document.body,
    start: 0,
    end: () => document.documentElement.scrollHeight - window.innerHeight,
    onUpdate: (self) => root.style.setProperty('--page-progress', self.progress.toFixed(4))
  });
}

export function initSmoothScroll() {
  window.gsap?.ticker?.lagSmoothing?.(0);
  return null;
}
