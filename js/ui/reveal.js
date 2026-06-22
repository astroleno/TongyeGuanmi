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
  ScrollTrigger.config({
    limitCallbacks: true,
    ignoreMobileResize: true
  });

  gsap.set('.reveal', { autoAlpha: 0, y: 24 });
  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      duration: 0.62,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 84%',
        end: 'bottom 20%',
        toggleActions: 'play none none none'
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

  const navElement = document.querySelector('.site-nav');
  const themedSections = gsap.utils.toArray('[data-section-theme]');
  if (navElement && themedSections.length) {
    const setNavTone = (section) => {
      const tone = section?.dataset.sectionTheme === 'light' ? 'light' : 'dark';
      navElement.dataset.tone = tone;
      navElement.classList.toggle('is-on-light', tone === 'light');
    };

    themedSections.forEach((section) => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top 14%',
        end: 'bottom 14%',
        onEnter: () => setNavTone(section),
        onEnterBack: () => setNavTone(section)
      });
    });

    const toneProbe = window.innerHeight * 0.14;
    const currentSection = themedSections.find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= toneProbe && rect.bottom > toneProbe;
    });
    if (currentSection) setNavTone(currentSection);
  }

  ScrollTrigger.create({
    trigger: document.body,
    start: 0,
    end: () => document.documentElement.scrollHeight - window.innerHeight,
    onUpdate: (self) => root.style.setProperty('--page-progress', self.progress.toFixed(4))
  });
}
