const revealControls = new WeakMap();
const suppressedOnce = new WeakSet();
const ENTRY_STATE_ATTR = 'data-entry-state';
const ENTRY_COUNT_ATTR = 'data-entry-count';

function incrementEntryCount(el) {
  const nextCount = Number(el.dataset.entryCount || 0) + 1;
  el.setAttribute(ENTRY_COUNT_ATTR, String(nextCount));
  el.dataset.entryCount = String(nextCount);
}

function markPresented(el, { countEntry = false } = {}) {
  const control = revealControls.get(el);
  control?.scrollTrigger?.kill?.();
  control?.tween?.kill?.();
  el.classList.add('is-visible');
  el.setAttribute(ENTRY_STATE_ATTR, 'presented');
  el.dataset.entryState = 'presented';
  if (countEntry) incrementEntryCount(el);

  if (window.gsap) {
    window.gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'visibility' });
    return;
  }

  el.style.opacity = '1';
  el.style.visibility = 'visible';
  el.style.transform = 'none';
}

function revealNow(el) {
  if (suppressedOnce.has(el)) {
    suppressedOnce.delete(el);
    markPresented(el, { countEntry: true });
    return;
  }

  el.setAttribute(ENTRY_STATE_ATTR, 'entering');
  el.dataset.entryState = 'entering';
  incrementEntryCount(el);
}

export function setRevealPresentedWithin(root = document) {
  const items = root.matches?.('.reveal')
    ? [root, ...root.querySelectorAll?.('.reveal') || []]
    : [...root.querySelectorAll?.('.reveal') || []];

  items.forEach((item) => markPresented(item));
}

export function suppressRevealOnceWithin(root = document) {
  const items = root.matches?.('.reveal')
    ? [root, ...root.querySelectorAll?.('.reveal') || []]
    : [...root.querySelectorAll?.('.reveal') || []];

  items.forEach((item) => {
    suppressedOnce.add(item);
    item.setAttribute(ENTRY_STATE_ATTR, 'suppressed-once');
    item.dataset.entryState = 'suppressed-once';
  });
}

export function initVanillaReveal() {
  const items = [...document.querySelectorAll('.reveal')];
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        revealNow(entry.target);
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

  items.forEach((item) => {
    item.setAttribute(ENTRY_STATE_ATTR, 'idle');
    item.dataset.entryState = 'idle';
    observer.observe(item);
  });
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
    el.setAttribute(ENTRY_STATE_ATTR, 'idle');
    el.dataset.entryState = 'idle';
    const tween = gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      duration: 0.62,
      ease: 'power3.out',
      onStart: () => revealNow(el),
      onComplete: () => {
        el.setAttribute(ENTRY_STATE_ATTR, 'presented');
        el.dataset.entryState = 'presented';
      },
      scrollTrigger: {
        trigger: el,
        start: 'top 84%',
        end: 'bottom 20%',
        toggleActions: 'play none none none'
      }
    });
    revealControls.set(el, { tween, scrollTrigger: tween.scrollTrigger });
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
