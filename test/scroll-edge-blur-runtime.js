(() => {
  const nav = document.querySelector('.site-nav');
  const showBtn = document.querySelector('#showBtn');
  const hideBtn = document.querySelector('#hideBtn');
  const sections = [...document.querySelectorAll('[data-tone]')];
  const params = new URLSearchParams(window.location.search);
  const forcedTone = params.get('tone');

  if (!nav) return;

  if (forcedTone === 'light') {
    document.body.dataset.demoTone = 'light';
  }

  const setVisible = (visible) => {
    nav.classList.toggle('demo-nav-visible', visible);
    nav.classList.toggle('demo-nav-hidden', !visible);
    showBtn?.classList.toggle('is-active', visible);
    hideBtn?.classList.toggle('is-active', !visible);
  };

  const setTone = () => {
    if (forcedTone === 'light' || forcedTone === 'dark') {
      nav.dataset.tone = forcedTone;
      nav.classList.toggle('is-on-light', forcedTone === 'light');
      return;
    }

    const probeY = window.innerHeight * 0.14;
    const active = sections.find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= probeY && rect.bottom >= probeY;
    });
    const tone = active?.dataset.tone === 'light' ? 'light' : 'dark';

    nav.dataset.tone = tone;
    nav.classList.toggle('is-on-light', tone === 'light');
  };

  showBtn?.addEventListener('click', () => setVisible(true));
  hideBtn?.addEventListener('click', () => setVisible(false));
  window.addEventListener('scroll', setTone, { passive: true });
  window.addEventListener('resize', setTone);
  setTone();
})();
