export function createSiteRuntime({
  body = document.body,
  loaderSequenceTotalMs,
  heroLoaderExitMs,
  reduceMotion = false
} = {}) {
  let loaderReadyAt = performance.now() + loaderSequenceTotalMs;

  const setLoaderReadyAt = (value) => {
    loaderReadyAt = value;
  };

  const playLoaderExit = (loader, onComplete) => {
    if (!loader) {
      body.classList.add('is-loader-hidden');
      onComplete();
      return;
    }

    let finished = false;
    let safetyTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(safetyTimer);
      body.classList.add('is-loader-hidden');
      loader.style.visibility = 'hidden';
      onComplete();
    };

    safetyTimer = window.setTimeout(finish, heroLoaderExitMs + 420);
    onComplete();

    if (reduceMotion || !window.gsap) {
      loader.classList.add('loader-css-exit');
      window.setTimeout(finish, reduceMotion ? 90 : heroLoaderExitMs);
      return;
    }

    const { gsap } = window;
    const word = loader.querySelector('.loader-word');
    const movingText = gsap.utils.toArray(loader.querySelectorAll('.loader-marquee-text'));

    gsap.set([word, ...movingText].filter(Boolean), { animationPlayState: 'paused' });
    gsap.timeline({
      defaults: { ease: 'power3.inOut' },
      onComplete: finish
    })
      .set(loader, { pointerEvents: 'none' })
      .to(word, {
        autoAlpha: 0,
        duration: 0.24,
        ease: 'power2.out'
      }, 0)
      .to(loader, {
        autoAlpha: 0,
        duration: 0.30,
        ease: 'power2.out'
      }, 0.02)
      .to({}, { duration: 0.04 });
  };

  const markLoaded = (delay = 300) => {
    const loaderDelay = Math.max(0, delay, loaderReadyAt - performance.now() + 40);
    window.setTimeout(() => {
      const wasLoaded = body.classList.contains('is-loaded');
      body.classList.add('is-loaded');
      if (wasLoaded) return;
      window.dispatchEvent(new CustomEvent('site:loaded'));

      const loader = document.querySelector('.loading-screen');
      let hiddenDispatched = false;
      const dispatchHidden = () => {
        if (hiddenDispatched) return;
        hiddenDispatched = true;
        window.dispatchEvent(new CustomEvent('site:loader-hidden'));
      };
      playLoaderExit(loader, dispatchHidden);
    }, loaderDelay);
  };

  return {
    setLoaderReadyAt,
    markLoaded
  };
}
