(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CDN = {
    gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
    scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js'
  };
  const HERO_VIDEO_SRC = '../video/figure1.webm';
  const HERO_VIDEO_SEGMENT_SECONDS = 2;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const lerp = (a, b, t) => a + (b - a) * t;


  function loadScript(src, timeout = 4200) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (!ok) {
          script.onerror = null;
          script.onload = null;
          script.remove();
        }
        ok ? resolve(value) : reject(value);
      };
      const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);
      script.src = src;
      script.async = false;
      script.onload = () => finish(true);
      script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function loadRequiredLibraries() {
    if (!window.gsap) await loadScript(CDN.gsap);
    if (!window.ScrollTrigger) await loadScript(CDN.scrollTrigger);
    if (!window.gsap || !window.ScrollTrigger) {
      throw new Error('Required animation libraries are unavailable.');
    }
  }

  function markLoaded(delay = 300) {
    window.setTimeout(() => body.classList.add('is-loaded'), delay);
  }

  function updatePageProgress() {
    const doc = document.documentElement;
    const total = Math.max(1, doc.scrollHeight - window.innerHeight);
    const progress = clamp(window.scrollY / total, 0, 1);
    root.style.setProperty('--page-progress', progress.toFixed(4));
  }

  function initCursorGlow() {
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;

    window.addEventListener('pointermove', (event) => {
      tx = event.clientX;
      ty = event.clientY;
      root.style.setProperty('--cursor-x', `${tx}px`);
      root.style.setProperty('--cursor-y', `${ty}px`);
    }, { passive: true });

    function tick() {
      cx = lerp(cx, tx, 0.11);
      cy = lerp(cy, ty, 0.11);
      root.style.setProperty('--cursor-x', `${cx}px`);
      root.style.setProperty('--cursor-y', `${cy}px`);
      requestAnimationFrame(tick);
    }
    if (!reduceMotion) tick();
  }

  function initVanillaReveal() {
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

  function initMagneticAndTilt() {
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

  function initFallbackParallax() {
    root.classList.add('webgl-fallback');
    const hero = document.querySelector('.hero-wrap');
    const back = document.querySelector('.fallback-back');
    const middle = document.querySelector('.fallback-middle');
    const figure = document.querySelector('.fallback-figure');
    const content = document.querySelector('.hero-content');
    if (!hero || !back || !middle || !figure) return;

    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let scroll = 0;
    let fallbackVideoDuration = 0;

    figure.loop = false;
    figure.pause();
    figure.addEventListener('loadedmetadata', () => {
      fallbackVideoDuration = Number.isFinite(figure.duration) && figure.duration > 0 ? figure.duration : 0;
      syncFallbackVideo();
    }, { once: true });

    window.addEventListener('pointermove', (event) => {
      tx = (event.clientX / window.innerWidth - 0.5) * 2;
      ty = (event.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    function computeScroll() {
      const rect = hero.getBoundingClientRect();
      const range = Math.max(1, rect.height - window.innerHeight);
      scroll = clamp(-rect.top / range, 0, 1);
      updatePageProgress();
      syncFallbackVideo();
    }

    function syncFallbackVideo() {
      const duration = fallbackVideoDuration || (Number.isFinite(figure.duration) ? figure.duration : 0);
      if (!duration || figure.readyState < 1) return;
      const targetTime = Math.min(duration - 0.04, Math.max(0, scroll * duration));
      if (Math.abs(figure.currentTime - targetTime) > 0.055) {
        try {
          figure.currentTime = targetTime;
        } catch {
          // Seeking can briefly fail before metadata settles in older WebKit builds.
        }
      }
    }

    window.addEventListener('scroll', computeScroll, { passive: true });
    window.addEventListener('resize', computeScroll, { passive: true });
    computeScroll();

    function tick() {
      mx = lerp(mx, tx, 0.08);
      my = lerp(my, ty, 0.08);
      back.style.transform = `translate3d(calc(-50% + ${mx * -10}px), calc(-52% + ${my * -6 - scroll * 28}px), 0) scale(${1.08 + scroll * 0.06})`;
      middle.style.transform = `translate3d(calc(-50% + ${mx * -24}px), calc(2% + ${my * -12 - scroll * 120}px), 0) scale(${1.02 + scroll * 0.58})`;
      figure.style.transform = `translate3d(calc(-50% + ${mx * 10}px), calc(-50% + ${my * 8 - scroll * 18}px), 0) scale(${1 + scroll * 0.08})`;
      if (content) content.style.transform = `translate3d(${mx * 8}px, ${my * 5 - scroll * 180}px, 0)`;
      requestAnimationFrame(tick);
    }
    if (!reduceMotion) tick();
    markLoaded(600);
  }

  function initGsapTextAndUI() {
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

    gsap.from('.site-nav', { y: -26, opacity: 0, duration: 0.9, ease: 'power3.out', delay: 0.25 });

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

  function initSmoothScroll() {
    window.gsap?.ticker?.lagSmoothing?.(0);
    return null;
  }

  function initLayeredHero() {
    const { gsap, ScrollTrigger } = window;
    const hero = document.querySelector('.hero-wrap');
    const scene = document.querySelector('.fallback-scene');
    const back = document.querySelector('.fallback-back');
    const middle = document.querySelector('.fallback-middle');
    const middleNearBlur = document.querySelector('.fallback-middle-near-blur');
    const figure = document.querySelector('.fallback-figure');
    const content = document.querySelector('.hero-content');
    const nav = document.querySelector('.site-nav');

    if (!hero || !scene || !back || !middle || !figure || !content) return;

    root.classList.add('layered-hero-ready');
    figure.src = HERO_VIDEO_SRC;
    figure.muted = true;
    figure.loop = false;
    figure.autoplay = false;
    figure.playsInline = true;
    figure.preload = 'auto';
    figure.setAttribute('muted', '');
    figure.setAttribute('playsinline', '');
    figure.setAttribute('webkit-playsinline', '');

    let segmentStart = 0.34;
    let segmentEnd = 2.45;
    let videoEnergy = 0;
    let lastVideoEnergyAt = performance.now();
    let lastHeroScrollAt = 0;
    let previousTargetProgress = null;
    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;

    const syncSegmentBounds = () => {
      const duration = Number.isFinite(figure.duration) && figure.duration > 0 ? figure.duration : 5.04;
      segmentStart = Math.min(0.42, Math.max(0, duration * 0.08));
      segmentEnd = Math.min(duration - 0.08, segmentStart + Math.min(HERO_VIDEO_SEGMENT_SECONDS, duration * 0.55));
      if (figure.readyState >= 1 && (!figure.currentTime || figure.currentTime < segmentStart || figure.currentTime > segmentEnd)) {
        try {
          figure.currentTime = segmentStart;
        } catch {
          // Metadata can settle a beat later on WebKit.
        }
      }
    };

    figure.addEventListener('loadedmetadata', syncSegmentBounds, { once: true });
    figure.addEventListener('canplay', syncSegmentBounds, { once: true });
    window.setTimeout(syncSegmentBounds, 900);

    [back, middle, middleNearBlur, figure].filter(Boolean).forEach((layer) => {
      layer.style.transform = 'none';
    });

    gsap.set(back, {
      xPercent: -50,
      yPercent: -50,
      scale: 1.08,
      transformOrigin: '50% 50%',
      force3D: true
    });
    gsap.set([middle, middleNearBlur].filter(Boolean), {
      xPercent: -50,
      yPercent: -50,
      y: '2vh',
      scale: 0.94,
      transformOrigin: '50% 62%',
      force3D: true
    });
    gsap.set(figure, {
      xPercent: -50,
      yPercent: -50,
      y: '12vh',
      scale: 1,
      transformOrigin: '50% 60%',
      force3D: true
    });
    gsap.set(content, {
      opacity: 1,
      visibility: 'visible',
      y: 0,
      filter: 'none',
      force3D: true
    });
    content.style.pointerEvents = 'none';

    const titleChars = gsap.utils.toArray(content.querySelectorAll('.hero-title-char'));
    const subtitle = content.querySelector('.hero-subtitle');
    const textItems = [...titleChars, subtitle].filter(Boolean);
    gsap.set(textItems, {
      autoAlpha: 0,
      y: 30,
      filter: 'blur(10px)',
      force3D: true
    });
    const textTimeline = gsap.timeline({
      paused: true,
      defaults: { duration: 1.2, ease: 'expo.out' }
    }).to(titleChars, {
      autoAlpha: 1,
      y: 0,
      filter: 'blur(0px)',
      stagger: 0.08
    }, 0).to(subtitle, {
      autoAlpha: 1,
      y: 0,
      filter: 'blur(0px)'
    }, 0.22);

    if (nav) gsap.set(nav, { autoAlpha: 0.76 });

    const setBackY = gsap.quickSetter(back, 'y', 'px');
    const setBackX = gsap.quickSetter(back, 'x', 'px');
    const setBackScaleX = gsap.quickSetter(back, 'scaleX');
    const setBackScaleY = gsap.quickSetter(back, 'scaleY');
    const setMiddleY = gsap.quickSetter(middle, 'y', 'px');
    const setMiddleX = gsap.quickSetter(middle, 'x', 'px');
    const setMiddleScaleX = gsap.quickSetter(middle, 'scaleX');
    const setMiddleScaleY = gsap.quickSetter(middle, 'scaleY');
    const setMiddleNearBlurY = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'y', 'px') : null;
    const setMiddleNearBlurX = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'x', 'px') : null;
    const setMiddleNearBlurScaleX = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'scaleX') : null;
    const setMiddleNearBlurScaleY = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'scaleY') : null;
    const setFigureY = gsap.quickSetter(figure, 'y', 'px');
    const setFigureX = gsap.quickSetter(figure, 'x', 'px');
    const setFigureScaleX = gsap.quickSetter(figure, 'scaleX');
    const setFigureScaleY = gsap.quickSetter(figure, 'scaleY');
    const setContentY = gsap.quickSetter(content, 'y', 'px');
    const setContentX = gsap.quickSetter(content, 'x', 'px');
    const setMiddleNearBlurOpacity = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'opacity') : null;
    const setNavOpacity = nav ? gsap.quickSetter(nav, 'opacity') : null;

    let renderedProgress = 0;
    let lastApplied = -1;
    let lastMouseAppliedX = 99;
    let lastMouseAppliedY = 99;
    let textVisible = false;
    let touchStartY = 0;

    const smoothStep = (value) => value * value * (3 - 2 * value);
    const range01 = (value, start, end) => clamp((value - start) / (end - start), 0, 1);
    const normalizeWheelDelta = (event) => {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
      return event.deltaY;
    };
    const clampTopScroll = () => {
      const top = hero.offsetTop;
      if (window.scrollY > top + 1) return false;
      window.scrollTo(0, top);
      return true;
    };
    const handleTopWheel = (event) => {
      const delta = normalizeWheelDelta(event);
      if (delta >= 0 || !clampTopScroll()) return;
      event.preventDefault();
      lastHeroScrollAt = performance.now();
    };
    const handleTopTouchStart = (event) => {
      touchStartY = event.touches?.[0]?.clientY || 0;
    };
    const handleTopTouchMove = (event) => {
      const currentY = event.touches?.[0]?.clientY || 0;
      const pullingDown = currentY > touchStartY;
      if (!pullingDown || !clampTopScroll()) return;
      event.preventDefault();
      lastHeroScrollAt = performance.now();
    };

    const updateVideoPlayback = (progress, scrollDelta) => {
      const now = performance.now();
      const elapsedFrames = clamp((now - lastVideoEnergyAt) / 16.67, 0.5, 4);
      lastVideoEnergyAt = now;
      const inVideoRange = progress > 0.045 && progress < 0.92;
      const recentlyScrolled = now - lastHeroScrollAt < 120;
      const scrollMoving = inVideoRange && (recentlyScrolled || scrollDelta > 0.001);
      if (scrollMoving) {
        videoEnergy = 1;
      } else {
        videoEnergy *= Math.pow(0.955, elapsedFrames);
      }

      if (!inVideoRange || videoEnergy < 0.14) {
        videoEnergy = inVideoRange ? videoEnergy : 0;
        if (!figure.paused) figure.pause();
        return;
      }

      syncSegmentBounds();
      if (figure.currentTime >= segmentEnd - 0.035) {
        if (!scrollMoving) {
          videoEnergy = 0;
          figure.pause();
          return;
        }
        try {
          figure.currentTime = segmentStart;
        } catch {
          // Ignore transient seek failures; the next frame will retry.
        }
      }

      try {
        figure.playbackRate = clamp(0.56 + videoEnergy * 0.44, 0.56, 1);
      } catch {
        // Older engines can reject playbackRate changes during metadata setup.
      }
      if (figure.paused) figure.play().catch(() => undefined);
    };

    const updateDepthFilters = (progress) => {
      const farClarity = smoothStep(range01(progress, 0.03, 0.66));
      const rockClarity = smoothStep(range01(progress, 0.10, 0.62));
      const farBlur = 2.4 * (1 - farClarity);
      const rockBlur = 0.15 * (1 - rockClarity);
      const nearBlurStrength = 1 - rockClarity;

      back.style.filter = `blur(${farBlur.toFixed(2)}px) saturate(${(0.92 + farClarity * 0.08).toFixed(3)}) contrast(${(0.96 + farClarity * 0.04).toFixed(3)}) brightness(${(0.58 + farClarity * 0.22).toFixed(3)})`;
      middle.style.filter = `blur(${rockBlur.toFixed(2)}px) saturate(${(1.06 + rockClarity * 0.05).toFixed(3)}) contrast(${(1.02 + rockClarity * 0.05).toFixed(3)}) brightness(${(1.04 + rockClarity * 0.06).toFixed(3)})`;

      if (middleNearBlur) {
        setMiddleNearBlurOpacity(0.24 * nearBlurStrength);
      }
    };

    const setTextVisible = (visible) => {
      if (visible === textVisible) return;
      textVisible = visible;
      content.style.pointerEvents = visible ? 'auto' : 'none';
      if (visible) {
        textTimeline.play();
      } else {
        textTimeline.reverse();
      }
    };

    function updateHeroLayers() {
      const range = Math.max(1, hero.offsetHeight - window.innerHeight);
      const targetProgress = clamp((window.scrollY - hero.offsetTop) / range, 0, 1);
      const scrollDelta = previousTargetProgress === null ? 0 : Math.abs(targetProgress - previousTargetProgress);
      previousTargetProgress = targetProgress;
      renderedProgress += (targetProgress - renderedProgress) * 0.22;
      mouseX += (targetMouseX - mouseX) * 0.08;
      mouseY += (targetMouseY - mouseY) * 0.08;
      updateVideoPlayback(renderedProgress, scrollDelta);

      const mouseChanged = Math.abs(lastMouseAppliedX - mouseX) > 0.001 || Math.abs(lastMouseAppliedY - mouseY) > 0.001;
      if (Math.abs(lastApplied - renderedProgress) < 0.0012 && !mouseChanged) return;
      lastApplied = renderedProgress;
      lastMouseAppliedX = mouseX;
      lastMouseAppliedY = mouseY;

      const p = renderedProgress;
      const textDrift = smoothStep(range01(p, 0.78, 0.96));
      const viewportH = window.innerHeight;
      const backParallaxX = mouseX * 0.02;
      const backParallaxY = mouseY * 0.02;
      const middleParallaxX = mouseX * 0.04;
      const middleParallaxY = mouseY * 0.04;
      const figureParallaxX = mouseX * 0.06;
      const figureParallaxY = mouseY * 0.06;
      const contentParallaxX = mouseX * 0.03;
      const contentParallaxY = mouseY * 0.03;
      const backScrollY = (-5 * p) * viewportH / 100;
      const middleScrollY = (1 + p * (window.innerWidth < 600 ? 14 : 18)) * viewportH / 100;
      const figureScrollY = (12 - p * 15) * viewportH / 100;

      setBackY(backScrollY + backParallaxY);
      setBackX(backParallaxX);
      const backScale = 1.10 + p * 0.10;
      setBackScaleX(backScale);
      setBackScaleY(backScale);
      setMiddleY(middleScrollY + middleParallaxY);
      setMiddleX(middleParallaxX);
      if (setMiddleNearBlurY) setMiddleNearBlurY(middleScrollY + middleParallaxY);
      if (setMiddleNearBlurX) setMiddleNearBlurX(middleParallaxX);
      const middleScale = 0.98 + p * 0.32;
      setMiddleScaleX(middleScale);
      setMiddleScaleY(middleScale);
      if (setMiddleNearBlurScaleX) setMiddleNearBlurScaleX(middleScale);
      if (setMiddleNearBlurScaleY) setMiddleNearBlurScaleY(middleScale);
      setFigureY(figureScrollY + figureParallaxY);
      setFigureX(figureParallaxX);
      const figureScale = 1 + p * 0.13;
      setFigureScaleX(figureScale);
      setFigureScaleY(figureScale);
      updateDepthFilters(p);

      setContentX(contentParallaxX);
      setContentY(-28 * textDrift + contentParallaxY);
      setTextVisible(textVisible ? p > 0.58 : p > 0.70);
      if (setNavOpacity) setNavOpacity(0.76 + Math.min(1, p / 0.16) * 0.24);

      root.style.setProperty('--hero-progress', p.toFixed(4));
    }

    window.addEventListener('scroll', () => {
      lastHeroScrollAt = performance.now();
    }, { passive: true });

    window.addEventListener('wheel', handleTopWheel, { passive: false });
    window.addEventListener('touchstart', handleTopTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTopTouchMove, { passive: false });

    window.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const rect = hero.getBoundingClientRect();
      if (rect.top > window.innerHeight || rect.bottom < 0) return;
      targetMouseX = event.clientX - window.innerWidth / 2;
      targetMouseY = event.clientY - window.innerHeight / 2;
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      targetMouseX = 0;
      targetMouseY = 0;
    }, { passive: true });

    gsap.ticker.add(updateHeroLayers);
    window.addEventListener('resize', () => {
      renderedProgress = -1;
      updateHeroLayers();
      ScrollTrigger.refresh();
    }, { passive: true });

    updateHeroLayers();
    ScrollTrigger.refresh();
    markLoaded(520);
  }

  function initThreeHero() {
    const { THREE, gsap, ScrollTrigger } = window;
    const canvas = document.getElementById('hero-webgl');
    const hero = document.querySelector('.hero-wrap');
    const fallback = document.querySelector('.fallback-scene');
    if (!canvas || !hero) {
      initFallbackParallax();
      return;
    }

    root.classList.add('webgl-ready');
    if (fallback) fallback.style.display = 'none';

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x030706, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    camera.position.z = 4;

    const world = new THREE.Group();
    const layers = new THREE.Group();
    const particleLayer = new THREE.Group();
    scene.add(world);
    world.add(layers);
    world.add(particleLayer);

    const state = {
      width: 1,
      height: 1,
      aspect: 1,
      scroll: 0,
      mouseX: 0,
      mouseY: 0,
      targetX: 0,
      targetY: 0,
      time: 0,
      videoDuration: 0,
      base: {}
    };

    const textureLoader = new THREE.TextureLoader();

    function loadTexture(url) {
      return new Promise((resolve, reject) => {
        textureLoader.load(url, (texture) => {
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          resolve(texture);
        }, undefined, reject);
      });
    }

    const planeVertex = `
      uniform float uTime;
      uniform float uScroll;
      uniform float uDepth;
      uniform vec2 uMouse;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float wave = sin((p.x * 2.8 + uTime * 0.16 + uScroll * 1.4) * 3.14159) * 0.012 * uDepth;
        wave += cos((p.y * 3.2 - uTime * 0.11) * 3.14159) * 0.008 * uDepth;
        p.z += wave;
        p.x += uMouse.x * uDepth * 0.018 * (uv.y - 0.5);
        p.y += uMouse.y * uDepth * 0.012 * (uv.x - 0.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `;

    const imageFragment = `
      uniform sampler2D uTexture;
      uniform float uAlpha;
      uniform float uScroll;
      uniform float uTone;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(uTexture, vUv);
        float center = smoothstep(0.78, 0.12, distance(vUv, vec2(0.5, 0.5)));
        vec3 deep = vec3(0.010, 0.026, 0.022);
        vec3 jade = vec3(0.055, 0.140, 0.125);
        color.rgb = mix(deep, color.rgb, 0.68 + center * 0.18);
        color.rgb = mix(color.rgb, jade, (1.0 - vUv.y) * 0.08 * uTone);
        color.rgb += vec3(0.018, 0.014, 0.008) * center * 0.05;
        color.rgb *= mix(0.52, 0.86, center);
        color.rgb = mix(color.rgb, vec3(0.020, 0.040, 0.034), 0.16 + uScroll * 0.18);
        gl_FragColor = vec4(color.rgb, color.a * uAlpha);
      }
    `;

    const videoVertex = `
      uniform float uTime;
      uniform float uScroll;
      uniform vec2 uMouse;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.x += sin((p.y * 7.0 + uTime * 1.2) * 0.8) * 0.004;
        p.x += uMouse.x * 0.010 * (0.5 + uv.y);
        p.y += uMouse.y * 0.006;
        p.z += uScroll * 0.02;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `;

    const videoFragment = `
      uniform sampler2D uTexture;
      uniform float uAlpha;
      uniform float uScroll;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uTexture, vUv);
        float maxc = max(max(c.r, c.g), c.b);
        float minc = min(min(c.r, c.g), c.b);
        float chroma = maxc - minc;
        float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        float whiteBg = smoothstep(0.78, 0.98, luma) * (1.0 - smoothstep(0.055, 0.18, chroma));
        float blackBg = (1.0 - smoothstep(0.020, 0.135, luma)) * (1.0 - smoothstep(0.040, 0.180, chroma));
        float edge = smoothstep(0.12, 0.42, distance(vUv, vec2(0.5, 0.5)));
        float keyedBg = max(whiteBg, blackBg);
        float alpha = (1.0 - keyedBg) * c.a * uAlpha;
        alpha *= smoothstep(0.0, 0.045, vUv.x) * (1.0 - smoothstep(0.955, 1.0, vUv.x));
        alpha *= smoothstep(0.0, 0.035, vUv.y) * (1.0 - smoothstep(0.965, 1.0, vUv.y));
        vec3 tint = vec3(0.88, 1.04, 1.00);
        c.rgb = pow(max(c.rgb, 0.0), vec3(0.92)) * tint;
        c.rgb = mix(c.rgb, vec3(0.08, 0.16, 0.14), uScroll * 0.08 * edge);
        gl_FragColor = vec4(c.rgb, alpha);
      }
    `;

    function imageMaterial(texture, { transparent = false, alpha = 1, depth = 1, tone = 1 } = {}) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uTime: { value: 0 },
          uScroll: { value: 0 },
          uDepth: { value: depth },
          uTone: { value: tone },
          uAlpha: { value: alpha },
          uMouse: { value: new THREE.Vector2(0, 0) }
        },
        vertexShader: planeVertex,
        fragmentShader: imageFragment,
        transparent,
        depthWrite: !transparent,
        depthTest: true
      });
    }

    function createParticleField() {
      const count = 260;
      const positions = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * 6.6;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2.4;
        positions[i * 3 + 2] = -0.2 + Math.random() * 1.7;
        sizes[i] = Math.random();
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uScroll: { value: 0 },
          uOpacity: { value: 0.20 },
          uColorA: { value: new THREE.Color(0xe8d59a) },
          uColorB: { value: new THREE.Color(0x38a69a) }
        },
        vertexShader: `
          attribute float aSize;
          uniform float uTime;
          uniform float uScroll;
          varying float vSize;
          void main() {
            vSize = aSize;
            vec3 p = position;
            p.y += sin(uTime * 0.24 + position.x * 2.1) * 0.018;
            p.x += cos(uTime * 0.18 + position.y * 2.6) * 0.012;
            p.z += uScroll * 0.26;
            vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (2.0 + aSize * 3.0) * (1.0 / max(0.8, -mvPosition.z + 4.0));
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          varying float vSize;
          void main() {
            vec2 p = gl_PointCoord - vec2(0.5);
            float d = length(p);
            float alpha = smoothstep(0.5, 0.0, d) * uOpacity * (0.45 + vSize * 0.8);
            vec3 color = mix(uColorB, uColorA, vSize);
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const points = new THREE.Points(geometry, material);
      particleLayer.add(points);
      return { points, material };
    }

    function createSignalLines() {
      const group = new THREE.Group();
      const material = new THREE.LineBasicMaterial({ color: 0x38a69a, transparent: true, opacity: 0.06 });
      for (let i = 0; i < 6; i += 1) {
        const geometry = new THREE.BufferGeometry();
        const y = -0.7 + Math.random() * 1.5;
        const z = 0.2 + Math.random() * 0.8;
        const points = [];
        const segments = 10;
        for (let j = 0; j <= segments; j += 1) {
          const t = j / segments;
          points.push(new THREE.Vector3(-3.2 + t * 6.4, y + Math.sin(t * Math.PI * 2 + i) * 0.035, z));
        }
        geometry.setFromPoints(points);
        const line = new THREE.Line(geometry, material.clone());
        line.userData.speed = 0.05 + Math.random() * 0.08;
        line.userData.baseY = y;
        group.add(line);
      }
      particleLayer.add(group);
      return group;
    }

    const video = document.createElement('video');
    video.src = HERO_VIDEO_SRC;
    video.muted = true;
    video.loop = false;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const videoReady = new Promise((resolve) => {
      const done = () => {
        state.videoDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : state.videoDuration;
        video.pause();
        resolve();
      };
      video.addEventListener('loadedmetadata', done, { once: true });
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      window.setTimeout(done, 1800);
    });

    const assetsReady = Promise.all([
      loadTexture('../image/back.png'),
      loadTexture('assets/middle.png'),
      videoReady
    ]).then(([backTexture, middleTexture]) => {
      const bgMat = imageMaterial(backTexture, { depth: 1.2, tone: 1.1 });
      const midMat = imageMaterial(middleTexture, { transparent: true, alpha: 0.98, depth: 2.0, tone: 1.3 });
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;

      const videoMat = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: videoTexture },
          uAlpha: { value: 0.94 },
          uScroll: { value: 0 },
          uTime: { value: 0 },
          uMouse: { value: new THREE.Vector2(0, 0) }
        },
        vertexShader: videoVertex,
        fragmentShader: videoFragment,
        transparent: true,
        depthWrite: false,
        depthTest: true
      });

      const bg = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1, 80, 50), bgMat);
      const middle = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1, 80, 44), midMat);
      const figure = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1, 32, 64), videoMat);

      bg.position.z = -1.0;
      middle.position.z = 0.05;
      figure.position.z = 0.65;
      layers.add(bg, middle, figure);

      const particles = createParticleField();
      const lines = createSignalLines();

      const allMaterials = [bgMat, midMat, videoMat, particles.material];

      function resize() {
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        state.aspect = state.width / state.height;
        camera.left = -state.aspect;
        camera.right = state.aspect;
        camera.top = 1;
        camera.bottom = -1;
        camera.updateProjectionMatrix();
        renderer.setSize(state.width, state.height, false);

        const viewW = state.aspect * 2;
        const viewH = 2;
        const backAspect = 1586 / 992;
        const middleAspect = 1672 / 941;
        const figureAspect = 1080 / 1920;

        let bgW;
        let bgH;
        if (state.aspect > backAspect) {
          bgW = viewW * 1.18;
          bgH = bgW / backAspect;
        } else {
          bgH = viewH * 1.18;
          bgW = bgH * backAspect;
        }
        bg.scale.set(bgW, bgH, 1);

        const middleW = Math.max(viewW * 1.18, state.aspect < 0.8 ? 2.25 : 3.8);
        const middleH = middleW / middleAspect;
        middle.scale.set(middleW, middleH, 1);

        const mobile = state.width < 720;
        const figureH = mobile ? viewH * 0.42 : viewH * 0.46;
        const figureW = figureH * figureAspect;
        figure.scale.set(figureW, figureH, 1);

        state.base = {
          bg: { x: 0, y: 0, z: -1.0 },
          middle: { x: 0, y: mobile ? -0.52 : -0.46, z: 0.05 },
          figure: {
            x: 0,
            y: mobile ? -0.02 : -0.03,
            z: 0.65
          },
          particlesScale: Math.max(1, state.aspect / 1.2)
        };
        particleLayer.scale.setScalar(state.base.particlesScale);
      }

      function applyScrollAndMouse() {
        const p = state.scroll;
        const mx = state.mouseX;
        const my = state.mouseY;
        const base = state.base;
        if (!base.bg) return;

        bg.position.set(
          base.bg.x + mx * -0.020,
          base.bg.y + my * -0.010 + p * 0.075,
          base.bg.z
        );
        middle.position.set(
          base.middle.x + mx * -0.082,
          base.middle.y + my * -0.040 - p * 0.28,
          base.middle.z + p * 0.10
        );
        figure.position.set(
          base.figure.x + mx * 0.024,
          base.figure.y + my * 0.018 - p * 0.055,
          base.figure.z + p * 0.18
        );

        const midScaleBoost = 1 + p * 0.56;
        middle.scale.x = middle.userData.baseScaleX ? middle.userData.baseScaleX * midScaleBoost : middle.scale.x;
        middle.scale.y = middle.userData.baseScaleY ? middle.userData.baseScaleY * midScaleBoost : middle.scale.y;

        world.rotation.y = mx * 0.025;
        world.rotation.x = -my * 0.015;
        camera.zoom = 1 + p * 0.08;
        camera.updateProjectionMatrix();

        bgMat.uniforms.uScroll.value = p;
        midMat.uniforms.uScroll.value = p;
        videoMat.uniforms.uScroll.value = p;
        particles.material.uniforms.uScroll.value = p;

        bgMat.uniforms.uMouse.value.set(mx, my);
        midMat.uniforms.uMouse.value.set(mx, my);
        videoMat.uniforms.uMouse.value.set(mx, my);

        videoMat.uniforms.uAlpha.value = 0.86 - p * 0.08;
        midMat.uniforms.uAlpha.value = 0.96;
        syncVideoToScroll(p);
      }

      function syncVideoToScroll(progress) {
        const duration = state.videoDuration || (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
        if (!duration || video.readyState < 1) return;

        const targetTime = Math.min(duration - 0.04, Math.max(0, progress * duration));
        if (Math.abs(video.currentTime - targetTime) <= 0.045) return;

        try {
          video.currentTime = targetTime;
          videoTexture.needsUpdate = true;
        } catch {
          // Some browsers briefly reject seeks while video metadata is settling.
        }
      }

      const originalResize = resize;
      function resizeAndCache() {
        originalResize();
        middle.userData.baseScaleX = middle.scale.x;
        middle.userData.baseScaleY = middle.scale.y;
      }

      resizeAndCache();
      window.addEventListener('resize', resizeAndCache, { passive: true });

      window.addEventListener('pointermove', (event) => {
        state.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
        state.targetY = (event.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });

      gsap.timeline({
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6
        }
      })
        .to(state, { scroll: 1, ease: 'none' }, 0)
        .to('.hero-content', { yPercent: -22, autoAlpha: 0.28, scale: 0.94, ease: 'none' }, 0);

      const clock = new THREE.Clock();
      function render() {
        state.time += clock.getDelta();
        state.mouseX = lerp(state.mouseX, state.targetX, 0.075);
        state.mouseY = lerp(state.mouseY, state.targetY, 0.075);
        allMaterials.forEach((mat) => {
          if (mat.uniforms.uTime) mat.uniforms.uTime.value = state.time;
        });
        lines.children.forEach((line, index) => {
          line.position.x = Math.sin(state.time * line.userData.speed + index) * 0.08;
          line.material.opacity = 0.025 + Math.sin(state.time * 0.34 + index) * 0.014;
        });
        applyScrollAndMouse();
        renderer.render(scene, camera);
        requestAnimationFrame(render);
      }

      video.pause();
      syncVideoToScroll(0);

      render();
      markLoaded(500);
    }).catch((error) => {
      console.warn('WebGL assets failed, switching to fallback.', error);
      initFallbackParallax();
    });

    window.setTimeout(() => {
      if (!body.classList.contains('is-loaded')) markLoaded(0);
    }, 2500);

    return assetsReady;
  }

  window.addEventListener('scroll', updatePageProgress, { passive: true });
  window.addEventListener('resize', updatePageProgress, { passive: true });
  updatePageProgress();

  if (reduceMotion) {
    initMagneticAndTilt();
    initFallbackParallax();
    initVanillaReveal();
    return;
  }

  loadRequiredLibraries()
    .then(() => {
      initSmoothScroll();
      initMagneticAndTilt();
      initGsapTextAndUI();
      initLayeredHero();
    })
    .catch((error) => {
      console.warn('CDN libraries unavailable, switching to fallback.', error);
      initMagneticAndTilt();
      initFallbackParallax();
      initVanillaReveal();
    });
})();
