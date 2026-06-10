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

  gsap.set('.reveal', { autoAlpha: 0, y: 28, rotateX: 1.5, transformPerspective: 800 });
  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      rotateX: 0,
      duration: 0.68,
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

  initPostHeroSnap({ gsap, ScrollTrigger });

  ScrollTrigger.create({
    trigger: document.body,
    start: 0,
    end: () => document.documentElement.scrollHeight - window.innerHeight,
    onUpdate: (self) => root.style.setProperty('--page-progress', self.progress.toFixed(4))
  });
}

function initPostHeroSnap({ gsap, ScrollTrigger }) {
  const stage = document.querySelector('.post-hero-stage');
  const sections = gsap.utils.toArray('.post-hero-stage > section');
  if (!stage || sections.length < 2) return;

  const SNAP_RADIUS_VH = 0.16;
  const FAST_SNAP_RADIUS_VH = 0.1;
  const FAST_SCROLL_VELOCITY = 1800;
  let snapTrigger = null;
  let snapPoints = [];
  const getSnapOffset = () => Math.round(window.innerHeight * 0.2);
  const getTargetScroll = (section) => (
    section.getBoundingClientRect().top + window.scrollY - getSnapOffset()
  );
  const refreshSnapPoints = () => {
    const start = snapTrigger?.start || 0;
    const end = snapTrigger?.end || ScrollTrigger.maxScroll(window);
    const range = Math.max(1, end - start);
    snapPoints = sections
      .map((section) => gsap.utils.clamp(0, 1, (getTargetScroll(section) - start) / range))
      .filter((point, index, points) => index === 0 || Math.abs(point - points[index - 1]) > 0.001);
  };
  const getSnapRadius = () => {
    const start = snapTrigger?.start || 0;
    const end = snapTrigger?.end || ScrollTrigger.maxScroll(window);
    const range = Math.max(1, end - start);
    const velocity = snapTrigger ? Math.abs(snapTrigger.getVelocity()) : 0;
    const radiusVh = velocity > FAST_SCROLL_VELOCITY ? FAST_SNAP_RADIUS_VH : SNAP_RADIUS_VH;
    return (window.innerHeight * radiusVh) / range;
  };

  snapTrigger = ScrollTrigger.create({
    id: 'post-hero-section-snap',
    trigger: stage,
    start: () => Math.max(0, getTargetScroll(sections[0])),
    end: () => ScrollTrigger.maxScroll(window),
    invalidateOnRefresh: true,
    onRefresh: refreshSnapPoints,
    snap: {
      snapTo: (progress) => {
        if (!snapPoints.length) refreshSnapPoints();
        const nearest = gsap.utils.snap(snapPoints, progress);
        return Math.abs(nearest - progress) <= getSnapRadius() ? nearest : progress;
      },
      duration: { min: 0.22, max: 0.48 },
      delay: 0.1,
      ease: 'power2.out'
    }
  });
}
