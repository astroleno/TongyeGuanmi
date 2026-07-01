export const homepageAssets = [
  { id: 'global-favicon', type: 'image', rawUrl: 'assets/favicon.svg', owners: ['global'] },
  { id: 'global-qiji-font', type: 'font', rawUrl: 'assets/fonts/qiji-title-subset.ttf', owners: ['global'] },

  { id: 'hero-back', type: 'image', rawUrl: 'assets/back1.png', owners: ['hero'] },
  { id: 'hero-middle', type: 'image', rawUrl: 'assets/middle1.png', owners: ['hero', 'contact'] },
  { id: 'hero-figure-video', type: 'video', rawUrl: 'assets/figure1.webm', owners: ['hero'] },
  { id: 'hero-figure-poster', type: 'image', rawUrl: 'assets/figure-poster.jpg', owners: ['hero'] },
  { id: 'hero-next-scene', type: 'image', rawUrl: 'assets/back2.png', owners: ['hero', 'star-map', 'figure2-animation'] },
  { id: 'hero-back-depth', type: 'image', rawUrl: 'assets/back1_depth.png', owners: ['hero'] },
  { id: 'hero-middle-depth', type: 'image', rawUrl: 'assets/middle1_depth.png', owners: ['hero'] },

  {
    id: 'pattern-background',
    type: 'image',
    rawUrl: 'assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png',
    owners: ['pattern']
  },
  { id: 'pattern-alpha-02', type: 'image', rawUrl: 'assets/patterns/alpha-layers/pattern-layer-alpha-02.png', owners: ['pattern'] },
  { id: 'pattern-alpha-03', type: 'image', rawUrl: 'assets/patterns/alpha-layers/pattern-layer-alpha-03.png', owners: ['pattern'] },
  { id: 'pattern-alpha-04', type: 'image', rawUrl: 'assets/patterns/alpha-layers/pattern-layer-alpha-04.png', owners: ['pattern'] },
  { id: 'pattern-alpha-05', type: 'image', rawUrl: 'assets/patterns/alpha-layers/pattern-layer-alpha-05.png', owners: ['pattern'] },
  { id: 'pattern-alpha-06', type: 'image', rawUrl: 'assets/patterns/alpha-layers/pattern-layer-alpha-06.png', owners: ['pattern'] },

  { id: 'paper-wash', type: 'image', rawUrl: 'assets/aod-paper-bg.png', owners: ['aod-animation', 'method-top', 'method-bottom', 'crane-animation'] },
  { id: 'aod-cloud', type: 'image', rawUrl: 'assets/aod_cloud-alpha.png', owners: ['aod-animation'] },
  { id: 'aod-sun', type: 'image', rawUrl: 'assets/aod_sun-alpha.png', owners: ['aod-animation'] },
  { id: 'aod-figure-front', type: 'video', rawUrl: 'assets/aod_figure-alpha-front-scrub.webm', owners: ['aod-animation'] },

  { id: 'figure2-cloud', type: 'image', rawUrl: 'assets/figure2-cloud-source.png?v=cloudsource3', owners: ['figure2-animation'] },
  { id: 'figure2-front-white', type: 'image', rawUrl: 'assets/figure2-front-white-source.png', owners: ['figure2-animation'] },
  { id: 'figure2-front-color', type: 'image', rawUrl: 'assets/figure2-front-color-source.png', owners: ['figure2-animation'] },
  {
    id: 'figure2-middle-composite',
    type: 'image',
    rawUrl: 'assets/figure2-middle-fresco-opaque-alpha.png?v=middlemaskhard1',
    owners: ['figure2-animation']
  },
  { id: 'figure2-near-arch', type: 'image', rawUrl: 'assets/arch2d-alpha.png', owners: ['figure2-animation'] },
  { id: 'figure2-arch-mask', type: 'image', rawUrl: 'assets/arch2b-alpha.png', owners: ['figure2-animation'] },
  {
    id: 'figure2-window-mask',
    type: 'image',
    rawUrl: 'assets/figure2-middle-window-mask.png?v=middlemaskhard1',
    owners: ['figure2-animation']
  },
  { id: 'figure2-depth-map', type: 'image', rawUrl: 'assets/figure2-middle-depth.png', owners: ['figure2-animation'] },
  { id: 'figure2-next-white', type: 'image', rawUrl: 'assets/figure2-next-white.png', owners: ['figure2-animation'] },
  { id: 'figure2a-alpha', type: 'video', rawUrl: 'assets/figure2a-alpha-auto.webm?v=auto2', owners: ['figure2-animation'] },
  { id: 'figure2a-fallback', type: 'video', rawUrl: 'assets/figure2a-reverse.mp4', owners: ['figure2-animation'] },
  { id: 'figure2a-poster', type: 'image', rawUrl: 'assets/figure2a-alpha-reverse-lite-poster.png', owners: ['figure2-animation'] },
  { id: 'figure2b-alpha', type: 'video', rawUrl: 'assets/figure2b-alpha-auto.webm?v=auto2', owners: ['figure2-animation'] },
  { id: 'figure2b-fallback', type: 'video', rawUrl: 'assets/figure2b-reverse.mp4', owners: ['figure2-animation'] },
  { id: 'figure2b-poster', type: 'image', rawUrl: 'assets/figure2b-alpha-reverse-lite-poster.png', owners: ['figure2-animation'] },

  { id: 'figure3-alpha', type: 'video', rawUrl: 'assets/figure3-alpha-scrub.webm?v=1280-q40', owners: ['figure3-animation'] },
  { id: 'figure3-poster', type: 'image', rawUrl: 'assets/figure3-alpha-poster.png', owners: ['figure3-animation'] },

  { id: 'ttg-bg', type: 'image', rawUrl: 'assets/ttg_bg.png', owners: ['ttg-animation'] },
  { id: 'ttg-middle', type: 'image', rawUrl: 'assets/ttg_middle-alpha.png', owners: ['ttg-animation'] },
  { id: 'ttg-middle-overlay', type: 'image', rawUrl: 'assets/ttg_middle-original-overlay-alpha.png', owners: ['ttg-animation'] },
  {
    id: 'ttg-front-original-overlay',
    type: 'image',
    rawUrl: 'assets/ttg_front-original-overlay-alpha.png?v=ttg-front-image15-blend80-v1',
    owners: ['ttg-animation']
  },
  {
    id: 'ttg-front-alpha',
    type: 'image',
    rawUrl: 'assets/ttg_front-alpha.png?v=ttg-front-image15-blend80-v1',
    owners: ['ttg-animation']
  },
  {
    id: 'ttg-figure-forward',
    type: 'video',
    rawUrl: 'assets/ttg_figure-alpha-scrub.webm?v=ttg-figure-blue-v2',
    owners: ['ttg-animation']
  },
  {
    id: 'ttg-figure-poster',
    type: 'image',
    rawUrl: 'assets/ttg_figure-alpha-scrub-poster.png?v=ttg-figure-blue-v2',
    owners: ['ttg-animation']
  },
  {
    id: 'ttg-figure-reverse',
    type: 'video',
    rawUrl: 'assets/ttg_figure-alpha-scrub-reverse.webm?v=ttg-figure-blue-v2',
    owners: ['ttg-animation']
  },

  { id: 'ph-background', type: 'image', rawUrl: 'assets/ph_background.png', owners: ['ph-animation'] },
  { id: 'ph-front', type: 'image', rawUrl: 'assets/ph_front-alpha.png', owners: ['ph-animation'] },
  {
    id: 'ph-figure-alpha',
    type: 'video',
    rawUrl: 'assets/ph_figure-alpha-scrub.webm?v=allkey-1672-simple-key-20260621',
    owners: ['ph-animation']
  },

  { id: 'crane-cloud-back', type: 'image', rawUrl: 'assets/crane1_cloud2-alpha.png', owners: ['crane-animation'] },
  { id: 'crane-figure-one', type: 'video', rawUrl: 'assets/crane-figure1-transition.webm', owners: ['crane-animation'] },
  { id: 'crane-arch', type: 'image', rawUrl: 'assets/crane1_arch-alpha.png', owners: ['crane-animation'] },
  { id: 'crane-cloud-front', type: 'image', rawUrl: 'assets/crane1_cloud1-alpha.png', owners: ['crane-animation'] },
  { id: 'crane-cloud-front-second', type: 'image', rawUrl: 'assets/crane1_cloud-front2-alpha.png', owners: ['crane-animation'] },
  { id: 'crane-figure-two', type: 'video', rawUrl: 'assets/crane-figure2-transition.webm', owners: ['crane-animation'] }
];

export const homepageExternalUrls = [
  {
    id: 'gsap-cdn',
    rawUrl: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
    allowlist: 'legacy-animation-cdn',
    reason: 'reported by PR1 scanner; not a homepage visual asset'
  },
  {
    id: 'scroll-trigger-cdn',
    rawUrl: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
    allowlist: 'legacy-animation-cdn',
    reason: 'reported by PR1 scanner; not a homepage visual asset'
  },
  {
    id: 'lenis-cdn',
    rawUrl: 'https://cdn.jsdelivr.net/npm/lenis@1.3.23/dist/lenis.min.js',
    allowlist: 'legacy-animation-cdn',
    reason: 'reported by PR1 scanner; not a homepage visual asset'
  }
];

export const homepageAssetScanConfig = {
  htmlEntrypoint: 'src/index.template.html',
  cssEntrypoints: ['css/styles.css'],
  jsEntrypoints: ['js/main.js'],
  additionalSourceFiles: [
    'js/transitions/pattern-bloom-adapter.js',
    'js/pattern-mirror-stage.js',
    'js/components/figure2-transition.js',
    'js/effects/ink-scene-transition.js',
    'js/effects/star-field-reveal.js'
  ]
};
