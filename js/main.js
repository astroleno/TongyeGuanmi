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
  const HERO_NEXT_SCENE_SRC = 'image/back2.png';
  const HERO_BACK_DEPTH_SRC = 'image/back_depth.png';
  const HERO_MIDDLE_DEPTH_SRC = 'image/middle_depth.png';
  const HERO_SCROLL_RANGE_VH = 25;
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
    const introRipple = document.querySelector('[data-hero-intro-ripple]');
    const inkCanvas = document.querySelector('[data-hero-ink-canvas]');
    const inkTransition = createInkTransition(inkCanvas);

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
    gsap.set(titleChars, {
      autoAlpha: 0,
      y: 12,
      scaleX: 0.96,
      filter: 'blur(7px)',
      transformOrigin: '50% 50%',
      force3D: true
    });
    if (subtitle) {
      gsap.set(subtitle, {
        autoAlpha: 0,
        y: 14,
        filter: 'blur(6px)',
        force3D: true
      });
    }
    const textTimeline = gsap.timeline({
      paused: true,
      defaults: { ease: 'power2.out' }
    }).to(titleChars, {
      autoAlpha: 1,
      y: 0,
      scaleX: 1,
      filter: 'blur(0px)',
      duration: 1.45,
      stagger: {
        each: 0.14,
        from: 'start'
      }
    }, 0);
    if (subtitle) {
      textTimeline.to(subtitle, {
        autoAlpha: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 1.15
      }, 0.48);
    }

    if (nav) gsap.set(nav, { autoAlpha: 0, y: -14, pointerEvents: 'none' });
    if (introRipple) {
      gsap.set(introRipple, {
        autoAlpha: 0,
        xPercent: -50,
        yPercent: -50,
        scale: 0.18,
        filter: 'blur(18px)',
        force3D: true
      });
    }
    if (inkCanvas) gsap.set(inkCanvas, { autoAlpha: 0 });

    const setBackY = gsap.quickSetter(back, 'y', 'px');
    const setBackX = gsap.quickSetter(back, 'x', 'px');
    const setBackScaleX = gsap.quickSetter(back, 'scaleX');
    const setBackScaleY = gsap.quickSetter(back, 'scaleY');
    const setBackOpacity = gsap.quickSetter(back, 'opacity');
    const setMiddleY = gsap.quickSetter(middle, 'y', 'px');
    const setMiddleX = gsap.quickSetter(middle, 'x', 'px');
    const setMiddleScaleX = gsap.quickSetter(middle, 'scaleX');
    const setMiddleScaleY = gsap.quickSetter(middle, 'scaleY');
    const setMiddleOpacity = gsap.quickSetter(middle, 'opacity');
    const setMiddleNearBlurY = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'y', 'px') : null;
    const setMiddleNearBlurX = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'x', 'px') : null;
    const setMiddleNearBlurScaleX = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'scaleX') : null;
    const setMiddleNearBlurScaleY = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'scaleY') : null;
    const setFigureY = gsap.quickSetter(figure, 'y', 'px');
    const setFigureX = gsap.quickSetter(figure, 'x', 'px');
    const setFigureScaleX = gsap.quickSetter(figure, 'scaleX');
    const setFigureScaleY = gsap.quickSetter(figure, 'scaleY');
    const setFigureOpacity = gsap.quickSetter(figure, 'opacity');
    const setContentY = gsap.quickSetter(content, 'y', 'px');
    const setContentX = gsap.quickSetter(content, 'x', 'px');
    const setMiddleNearBlurOpacity = middleNearBlur ? gsap.quickSetter(middleNearBlur, 'opacity') : null;
    const setNavOpacity = nav ? gsap.quickSetter(nav, 'opacity') : null;
    const setNavY = nav ? gsap.quickSetter(nav, 'y', 'px') : null;
    const setIntroRippleOpacity = introRipple ? gsap.quickSetter(introRipple, 'opacity') : null;
    const setIntroRippleScale = introRipple ? gsap.quickSetter(introRipple, 'scale') : null;

    let renderedProgress = 0;
    let lastApplied = -1;
    let lastMouseAppliedX = 99;
    let lastMouseAppliedY = 99;
    let lastNavReveal = -1;
    let lastInkProgress = -1;
    let touchStartY = 0;

    const smoothStep = (value) => value * value * (3 - 2 * value);
    const range01 = (value, start, end) => clamp((value - start) / (end - start), 0, 1);
    const getHeroRanges = () => {
      const desiredRange = window.innerHeight * (HERO_SCROLL_RANGE_VH / 100);
      const totalRange = Math.max(1, Math.min(hero.offsetHeight - window.innerHeight, desiredRange));
      const holdRange = Math.min(totalRange * 0.20, window.innerHeight * 0.05);
      const animationRange = Math.max(1, totalRange - holdRange);
      return { totalRange, animationRange, holdRange };
    };
    function createInkTransition(canvas) {
      if (!canvas) return null;

      const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        powerPreference: 'high-performance'
      });
      if (!gl) return null;

      const vertexSource = `
        attribute vec2 aPosition;
        varying vec2 vUv;

        void main() {
          vUv = aPosition * 0.5 + 0.5;
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `;
      const fragmentSource = `
        precision highp float;

        varying vec2 vUv;
        uniform vec2 uResolution;
        uniform vec2 uMouse;
        uniform float uProgress;
        uniform float uTime;
        uniform sampler2D uNextScene;
        uniform vec2 uNextSize;
        uniform float uNextReady;
        uniform sampler2D uBackDepth;
        uniform sampler2D uMiddleDepth;
        uniform vec2 uDepthSize;
        uniform float uDepthReady;

        float hash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.37);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          mat2 rotate = mat2(0.80, 0.60, -0.60, 0.80);
          for (int i = 0; i < 5; i++) {
            value += noise(p) * amplitude;
            p = rotate * p * 2.02 + 7.13;
            amplitude *= 0.5;
          }
          return value;
        }

        vec2 coverUv(vec2 uv, vec2 textureSize, vec2 resolution) {
          float screenAspect = resolution.x / max(resolution.y, 1.0);
          float textureAspect = textureSize.x / max(textureSize.y, 1.0);
          vec2 covered = uv;
          if (screenAspect > textureAspect) {
            covered.y = (uv.y - 0.5) * (screenAspect / textureAspect) + 0.5;
          } else {
            covered.x = (uv.x - 0.5) * (textureAspect / screenAspect) + 0.5;
          }
          return covered;
        }

        void main() {
          float p = smoothstep(0.0, 1.16, uProgress);
          float energy = sin(p * 3.14159265);
          float aspect = uResolution.x / max(uResolution.y, 1.0);
          vec2 uv = vUv;
          vec2 center = vec2(0.50, 0.54) + uMouse * vec2(0.026, -0.020);
          center += vec2(sin(uTime * 0.18), cos(uTime * 0.16)) * 0.005;

          vec2 aspectUv = vec2(uv.x * aspect, uv.y);
          vec2 depthUv = coverUv(uv, uDepthSize, uResolution);
          float farDepth = smoothstep(0.06, 0.90, texture2D(uBackDepth, depthUv).r) * uDepthReady;
          float nearDepth = smoothstep(0.10, 0.84, texture2D(uMiddleDepth, depthUv).r) * uDepthReady;
          float zDepth = clamp(max(farDepth * 0.52, nearDepth), 0.0, 1.0);
          vec2 centered = (uv - center) * vec2(aspect, 1.0);
          float dist = length(centered) * 0.74;
          float centerPull = smoothstep(0.76, -0.18, abs(uv.x - center.x));
          float mountainSweep = mix(dist, uv.y * 0.48 + dist * 0.58, centerPull * 0.38);

          vec2 warpUv = aspectUv * 2.35 + vec2(0.0, -uTime * 0.030);
          vec2 warp = vec2(
            fbm(warpUv + vec2(1.7, 4.1)),
            fbm(warpUv + vec2(8.3, 2.2))
          ) - 0.5;
          float mud = fbm(aspectUv * 4.5 + warp * 1.65 - uTime * 0.040) * 0.30;
          mud += fbm(aspectUv * 13.5 - warp * 2.6 + uTime * 0.075) * 0.105;
          mud += fbm(aspectUv * 31.0 + warp * 3.2 - uTime * 0.12) * 0.035;
          mud += sin((uv.x + uv.y) * 34.0 + uTime * 0.9) * 0.018;

          float threshold = mountainSweep + mud - 0.105;
          float depthTear = nearDepth * (0.13 + fbm(aspectUv * 19.0 + uTime * 0.11) * 0.065);
          float farTear = farDepth * (0.035 + fbm(aspectUv * 7.0 - uTime * 0.05) * 0.025);
          threshold = mix(threshold, 0.0, smoothstep(0.91, 1.0, p));
          float farEdge = p - (threshold - farTear);
          float nearEdge = p - (threshold - depthTear);
          float farDissolve = smoothstep(-0.030, 0.052, farEdge);
          float nearDissolve = smoothstep(-0.052, 0.078, nearEdge);
          float dissolve = max(farDissolve, nearDissolve * nearDepth);
          float farSoftBand = 1.0 - smoothstep(0.0, 0.115, abs(farEdge));
          float nearSoftBand = nearDepth * (1.0 - smoothstep(0.0, 0.155, abs(nearEdge)));
          float farHotBand = 1.0 - smoothstep(0.0, 0.045, abs(farEdge));
          float nearHotBand = nearDepth * (1.0 - smoothstep(0.0, 0.062, abs(nearEdge)));
          float softBand = max(farSoftBand, nearSoftBand * 1.24);
          float hotBand = max(farHotBand, nearHotBand * 1.38);
          float emberMask = smoothstep(0.67, 0.985, hash(floor((aspectUv + warp * 0.58) * uResolution.y * 0.060 + uTime * 4.0)));
          float ember = softBand * emberMask * (0.18 + energy * 0.46);
          float late = smoothstep(0.72, 1.0, p);

          vec3 ink = vec3(0.018, 0.038, 0.030);
          vec3 jade = vec3(0.30, 0.78, 0.66);
          vec3 gold = vec3(0.98, 0.82, 0.45);
          vec3 light = mix(jade, gold, smoothstep(0.30, 0.92, hash(floor(aspectUv * 42.0))));
          float glow = softBand * (0.32 + energy * 0.30) + hotBand * (0.34 + energy * 0.28) + ember * 0.58;

          vec2 dispVec = vec2(
            fbm(aspectUv * 1.55 + vec2(2.0, 7.0) + uTime * 0.025),
            fbm(aspectUv * 1.55 + vec2(9.0, 3.0) - uTime * 0.020)
          );
          vec2 changeVec = normalize(vec2(warp.x * 0.75 + center.x - uv.x, -0.92 + warp.y * 0.42));
          float dispClamp = clamp(dispVec.x, dispVec.y, uv.y);
          float distMap = distance(uv, dispVec) + dispClamp * sin(uTime * 7.0 + zDepth * 2.6);
          vec2 depthDistortion = changeVec * distMap * (0.008 + farDepth * 0.024 + nearDepth * 0.070) * (0.28 + energy * 0.92);
          vec2 nextUv = coverUv((uv + depthDistortion - center) * (1.0 - p * 0.035 - nearDepth * energy * 0.018) + center, uNextSize, uResolution);
          vec3 nextScene = texture2D(uNextScene, nextUv).rgb;
          nextScene = mix(vec3(0.020, 0.034, 0.030), nextScene, uNextReady);
          float innerLift = smoothstep(0.06, 0.74, p);
          vec3 innerColor = mix(nextScene * 0.42, nextScene * 1.14 + vec3(0.055, 0.043, 0.018), innerLift);
          innerColor = mix(innerColor, nextScene * 1.02, late * 0.65);
          innerColor = mix(innerColor, innerColor * 1.08 + vec3(0.015, 0.035, 0.026), nearSoftBand * 0.34);

          float outsideAlpha = (1.0 - dissolve) * (0.05 + p * 0.34 + late * 0.22);
          float insideMask = smoothstep(0.08, 0.42, dissolve);
          vec3 edgeColor = mix(jade, gold, smoothstep(0.24, 0.90, fbm(aspectUv * (4.5 + zDepth * 4.0) + uTime * 0.04)));
          vec3 outsideColor = vec3(0.012, 0.022, 0.018);
          vec3 color = mix(outsideColor, innerColor, insideMask);
          color = mix(color, edgeColor, clamp(glow, 0.0, 0.80));

          float alpha = mix(outsideAlpha, 1.0, insideMask);
          alpha += softBand * 0.10 + hotBand * 0.18 + nearSoftBand * 0.12 + ember * 0.24;
          alpha += smoothstep(0.90, 1.0, p) * 0.08;
          alpha = clamp(alpha, 0.0, 1.0);

          gl_FragColor = vec4(color, alpha);
        }
      `;

      const compileShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.warn('Ink shader compile failed:', gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      if (!vertexShader || !fragmentShader) return null;

      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('Ink shader link failed:', gl.getProgramInfoLog(program));
        return null;
      }

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      const positionLocation = gl.getAttribLocation(program, 'aPosition');
      const uniforms = {
        resolution: gl.getUniformLocation(program, 'uResolution'),
        mouse: gl.getUniformLocation(program, 'uMouse'),
        progress: gl.getUniformLocation(program, 'uProgress'),
        time: gl.getUniformLocation(program, 'uTime'),
        nextScene: gl.getUniformLocation(program, 'uNextScene'),
        nextSize: gl.getUniformLocation(program, 'uNextSize'),
        nextReady: gl.getUniformLocation(program, 'uNextReady'),
        backDepth: gl.getUniformLocation(program, 'uBackDepth'),
        middleDepth: gl.getUniformLocation(program, 'uMiddleDepth'),
        depthSize: gl.getUniformLocation(program, 'uDepthSize'),
        depthReady: gl.getUniformLocation(program, 'uDepthReady')
      };

      const createTextureLayer = (src, fallback) => {
        const texture = gl.createTexture();
        const layer = { texture, width: 1, height: 1, ready: 0 };
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fallback));

        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          layer.width = image.naturalWidth || 1;
          layer.height = image.naturalHeight || 1;
          layer.ready = 1;
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        };
        image.src = src;
        return layer;
      };

      const bindLayer = (unit, layer) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, layer.texture);
      };

      const nextLayer = createTextureLayer(HERO_NEXT_SCENE_SRC, [5, 8, 7, 255]);
      const backDepthLayer = createTextureLayer(HERO_BACK_DEPTH_SRC, [0, 0, 0, 255]);
      const middleDepthLayer = createTextureLayer(HERO_MIDDLE_DEPTH_SRC, [0, 0, 0, 255]);

      let width = 0;
      let height = 0;
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
        const nextWidth = Math.max(1, Math.round(rect.width * ratio));
        const nextHeight = Math.max(1, Math.round(rect.height * ratio));
        if (nextWidth !== width || nextHeight !== height) {
          width = nextWidth;
          height = nextHeight;
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }
        return rect.width > 0 && rect.height > 0;
      };

      gl.useProgram(program);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      bindLayer(0, nextLayer);
      gl.uniform1i(uniforms.nextScene, 0);
      bindLayer(1, backDepthLayer);
      gl.uniform1i(uniforms.backDepth, 1);
      bindLayer(2, middleDepthLayer);
      gl.uniform1i(uniforms.middleDepth, 2);

      return {
        render(progress, pointerX, pointerY) {
          const active = progress > 0.002;
          canvas.style.visibility = active ? 'visible' : 'hidden';
          canvas.style.opacity = active ? '1' : '0';
          if (!resize()) return;

          gl.clear(gl.COLOR_BUFFER_BIT);
          if (!active) return;

          gl.useProgram(program);
          gl.uniform2f(uniforms.resolution, width, height);
          gl.uniform2f(
            uniforms.mouse,
            clamp(pointerX / Math.max(1, window.innerWidth), -0.5, 0.5),
            clamp(pointerY / Math.max(1, window.innerHeight), -0.5, 0.5)
          );
          gl.uniform1f(uniforms.progress, progress);
          gl.uniform1f(uniforms.time, performance.now() * 0.001);
          bindLayer(0, nextLayer);
          bindLayer(1, backDepthLayer);
          bindLayer(2, middleDepthLayer);
          gl.uniform2f(uniforms.nextSize, nextLayer.width, nextLayer.height);
          gl.uniform1f(uniforms.nextReady, nextLayer.ready);
          gl.uniform2f(uniforms.depthSize, middleDepthLayer.width || backDepthLayer.width, middleDepthLayer.height || backDepthLayer.height);
          gl.uniform1f(uniforms.depthReady, Math.min(backDepthLayer.ready, middleDepthLayer.ready));
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      };
    }

    const updateInkTransition = (progress) => {
      inkTransition?.render(progress, mouseX, mouseY);
    };
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
      const top = hero.offsetTop;
      if (delta >= 0 || window.scrollY > top + Math.abs(delta) + 1) return;
      window.scrollTo(0, top);
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
      const farClarity = smoothStep(range01(progress, 0.02, 0.46));
      const rockClarity = smoothStep(range01(progress, 0.12, 0.72));
      const figureClarity = smoothStep(range01(progress, 0.24, 0.92));
      const farBlur = 2.4 + 24 * (1 - farClarity);
      const rockBlur = 0.15 + 26 * (1 - rockClarity);
      const figureBlur = 2 + 30 * (1 - figureClarity);
      const nearBlurStrength = 1 - rockClarity;

      back.style.filter = `blur(${farBlur.toFixed(2)}px) saturate(${(0.86 + farClarity * 0.14).toFixed(3)}) contrast(${(0.92 + farClarity * 0.08).toFixed(3)}) brightness(${(0.46 + farClarity * 0.34).toFixed(3)})`;
      middle.style.filter = `blur(${rockBlur.toFixed(2)}px) saturate(${(0.92 + rockClarity * 0.19).toFixed(3)}) contrast(${(0.94 + rockClarity * 0.13).toFixed(3)}) brightness(${(0.70 + rockClarity * 0.40).toFixed(3)})`;
      figure.style.filter = `url('#figure-alpha-clean') blur(${figureBlur.toFixed(2)}px) brightness(${(0.86 + figureClarity * 0.22).toFixed(3)}) saturate(${(0.92 + figureClarity * 0.14).toFixed(3)}) contrast(${(0.92 + figureClarity * 0.10).toFixed(3)})`;

      if (middleNearBlur) {
        setMiddleNearBlurOpacity(0.24 * nearBlurStrength);
      }
    };

    function updateHeroLayers() {
      const { totalRange, animationRange, holdRange } = getHeroRanges();
      const rawHeroScroll = window.scrollY - hero.offsetTop;
      const targetProgress = clamp((window.scrollY - hero.offsetTop) / animationRange, 0, 1);
      const scrollDelta = previousTargetProgress === null ? 0 : Math.abs(targetProgress - previousTargetProgress);
      previousTargetProgress = targetProgress;
      renderedProgress += (targetProgress - renderedProgress) * 0.22;
      mouseX += (targetMouseX - mouseX) * 0.08;
      mouseY += (targetMouseY - mouseY) * 0.08;
      updateVideoPlayback(renderedProgress, scrollDelta);

      const navReveal = setNavOpacity && setNavY
        ? smoothStep(clamp((window.scrollY - (hero.offsetTop + totalRange + 16)) / 180, 0, 1))
        : 0;
      const inkProgress = smoothStep(clamp((rawHeroScroll - animationRange) / Math.max(1, holdRange), 0, 1));
      const mouseChanged = Math.abs(lastMouseAppliedX - mouseX) > 0.001 || Math.abs(lastMouseAppliedY - mouseY) > 0.001;
      const navChanged = Math.abs(lastNavReveal - navReveal) > 0.001;
      const inkChanged = Math.abs(lastInkProgress - inkProgress) > 0.001;
      const inkAnimating = inkProgress > 0.002 && inkProgress < 0.995;
      if (Math.abs(lastApplied - renderedProgress) < 0.0012 && !mouseChanged && !navChanged && !inkChanged && !inkAnimating) return;
      lastApplied = renderedProgress;
      lastMouseAppliedX = mouseX;
      lastMouseAppliedY = mouseY;
      lastNavReveal = navReveal;
      lastInkProgress = inkProgress;

      const p = renderedProgress;
      const viewportH = window.innerHeight;
      const farReveal = smoothStep(range01(p, 0.00, 0.48));
      const middleReveal = smoothStep(range01(p, 0.12, 0.74));
      const figureReveal = smoothStep(range01(p, 0.24, 0.94));
      const rippleOpen = smoothStep(range01(p, 0.00, 0.44));
      const rippleFade = 1 - smoothStep(range01(p, 0.42, 0.86));
      const backParallaxX = mouseX * 0.02;
      const backParallaxY = mouseY * 0.02;
      const middleParallaxX = mouseX * 0.04;
      const middleParallaxY = mouseY * 0.04;
      const figureParallaxX = mouseX * 0.06;
      const figureParallaxY = mouseY * 0.06;
      const backScrollY = (6 - farReveal * 11) * viewportH / 100;
      const middleScrollY = (13 - middleReveal * (window.innerWidth < 600 ? 10 : 12)) * viewportH / 100;
      const figureScrollY = (20 - figureReveal * 20) * viewportH / 100;

      if (setIntroRippleOpacity && setIntroRippleScale && introRipple) {
        setIntroRippleOpacity(0.86 * rippleFade);
        setIntroRippleScale(0.24 + rippleOpen * 2.3);
        introRipple.style.visibility = rippleFade > 0.01 ? 'visible' : 'hidden';
        introRipple.style.filter = `blur(${(18 - rippleOpen * 15).toFixed(2)}px)`;
      }

      setBackY(backScrollY + backParallaxY);
      setBackX(backParallaxX);
      setBackOpacity(0.32 + farReveal * 0.68);
      const backScale = 1.24 - farReveal * 0.14;
      setBackScaleX(backScale);
      setBackScaleY(backScale);
      setMiddleY(middleScrollY + middleParallaxY);
      setMiddleX(middleParallaxX);
      setMiddleOpacity(0.06 + middleReveal * 0.94);
      if (setMiddleNearBlurY) setMiddleNearBlurY(middleScrollY + middleParallaxY);
      if (setMiddleNearBlurX) setMiddleNearBlurX(middleParallaxX);
      const middleScale = 1.18 - middleReveal * 0.20;
      setMiddleScaleX(middleScale);
      setMiddleScaleY(middleScale);
      if (setMiddleNearBlurScaleX) setMiddleNearBlurScaleX(middleScale);
      if (setMiddleNearBlurScaleY) setMiddleNearBlurScaleY(middleScale);
      setFigureY(figureScrollY + figureParallaxY);
      setFigureX(figureParallaxX);
      setFigureOpacity(0.03 + figureReveal * 0.97);
      const figureScale = 1.32 - figureReveal * 0.32;
      setFigureScaleX(figureScale);
      setFigureScaleY(figureScale);
      updateDepthFilters(p);

      setContentX(0);
      setContentY(0);
      const textReveal = smoothStep(range01(p, 0.48, 0.92));
      textTimeline.progress(textReveal);
      updateInkTransition(inkProgress);
      if (setNavOpacity && setNavY) {
        setNavOpacity(navReveal);
        setNavY((1 - navReveal) * -14);
        nav.style.visibility = navReveal > 0.01 ? 'visible' : 'hidden';
        nav.style.pointerEvents = navReveal > 0.98 ? 'auto' : 'none';
      }

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
