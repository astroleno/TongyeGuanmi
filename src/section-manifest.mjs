export const contentSections = [
  {
    id: 'belief',
    match: 'canvas-section--belief',
    navLabel: '',
    includeInNav: false,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'method',
    match: 'id="method"',
    navLabel: '方法',
    includeInNav: true,
    theme: 'light',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'brand',
    match: 'canvas-section--brand',
    navLabel: '',
    includeInNav: false,
    theme: 'light',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'services',
    match: 'id="services"',
    navLabel: '场景',
    includeInNav: true,
    theme: 'light',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'lab',
    match: 'id="lab"',
    navLabel: '',
    includeInNav: false,
    theme: 'light',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'education',
    match: 'id="education"',
    navLabel: '留学',
    includeInNav: true,
    theme: 'light',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'philosophy',
    match: 'id="philosophy"',
    navLabel: '',
    includeInNav: false,
    theme: 'light',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'contact',
    match: 'id="contact"',
    navLabel: '联系',
    includeInNav: true,
    theme: 'light',
    navBg: 'solid',
    layout: 'editorial-flat'
  }
];

export const chapterTransitions = [
  {
    id: 'home-belief',
    from: 'home',
    to: 'belief',
    module: 'pattern-bloom',
    variant: 'lotus-manifesto',
    drive: 'scroll'
  },
  {
    id: 'belief-method',
    from: 'belief',
    to: 'method-field-law',
    module: 'aod',
    variant: 'measure-order',
    handoffTarget: '#method',
    handoffPhase: 'after-playback'
  },
  {
    id: 'method-brand',
    from: 'method-proof',
    to: 'brand',
    module: 'soft-divider',
    variant: 'method-to-brand'
  },
  {
    id: 'brand-services',
    from: 'brand',
    to: 'services',
    module: 'figure3-transition',
    variant: 'fabric-menu',
    handoffTarget: '#services',
    handoffPhase: 'after-playback'
  },
  {
    id: 'services-lab',
    from: 'services',
    to: 'lab',
    module: 'ttg',
    variant: 'structure-field'
  },
  {
    id: 'lab-education',
    from: 'lab',
    to: 'education',
    module: 'ph',
    variant: 'learning-sun'
  },
  {
    id: 'education-philosophy',
    from: 'education',
    to: 'philosophy',
    module: 'soft-breath',
    variant: 'quiet-values'
  },
  {
    id: 'philosophy-contact',
    from: 'philosophy',
    to: 'contact',
    module: 'crane',
    variant: 'forward-motion',
    handoffTarget: '#contact',
    handoffPhase: 'after-playback'
  }
];

export const sectionEntryPolicies = {
  belief: {
    directVisit: 'replay',
    afterHandoff: 'continue'
  },
  method: {
    directVisit: 'replay',
    afterHandoff: 'skip'
  },
  brand: {
    directVisit: 'replay',
    afterHandoff: 'skip'
  },
  services: {
    directVisit: 'replay',
    afterHandoff: 'replay'
  },
  lab: {
    directVisit: 'replay',
    afterHandoff: 'replay'
  },
  education: {
    directVisit: 'replay',
    afterHandoff: 'replay'
  },
  philosophy: {
    directVisit: 'replay',
    afterHandoff: 'replay'
  },
  contact: {
    directVisit: 'replay',
    afterHandoff: 'skip'
  }
};

export const handoffs = [
  {
    id: 'home-belief',
    transitionId: 'home-belief',
    from: 'home',
    to: 'belief',
    owner: 'target-section',
    transition: {
      mode: 'scroll-bridge',
      ghostScenes: ['pattern-bloom-lotus'],
      targetSelector: '.belief-copy-wrap'
    },
    targetEntry: {
      policy: 'continue',
      suppressOnceAfterHandoff: true,
      directVisitPolicy: 'replay'
    },
    afterComplete: {
      markTargetPresented: true,
      scrollTo: '#belief',
      snapToVisualStart: true,
      cleanupGhosts: true
    },
    reducedMotion: {
      policy: 'jump-to-presented'
    }
  },
  {
    id: 'belief-method',
    transitionId: 'belief-method',
    from: 'belief',
    to: 'method',
    owner: 'target-section',
    transition: {
      mode: 'after-playback',
      ghostScenes: ['aod-field'],
      targetSelector: '.method-edition-layout--after-handoff'
    },
    targetEntry: {
      policy: 'skip',
      suppressOnceAfterHandoff: true,
      directVisitPolicy: 'replay'
    },
    afterComplete: {
      markTargetPresented: true,
      scrollTo: '#method',
      snapToVisualStart: true,
      cleanupGhosts: true
    },
    reducedMotion: {
      policy: 'jump-to-presented'
    }
  },
  {
    id: 'method-proof-brand',
    transitionId: 'method-tooling__method-proof',
    from: 'method-proof',
    to: 'brand',
    owner: 'target-section',
    transition: {
      mode: 'post-scroll',
      ghostScenes: ['method-proof-bridge'],
      targetSelector: '.brand-definition-grid'
    },
    targetEntry: {
      policy: 'skip',
      suppressOnceAfterHandoff: true,
      directVisitPolicy: 'replay'
    },
    afterComplete: {
      markTargetPresented: true,
      scrollTo: '#brand',
      snapToVisualStart: true,
      cleanupGhosts: true
    },
    reducedMotion: {
      policy: 'jump-to-presented'
    }
  },
  {
    id: 'philosophy-contact',
    transitionId: 'philosophy-contact',
    from: 'philosophy',
    to: 'contact',
    owner: 'target-section',
    transition: {
      mode: 'after-playback',
      ghostScenes: ['crane-motion'],
      targetSelector: '.contact-endpoint'
    },
    targetEntry: {
      policy: 'skip',
      suppressOnceAfterHandoff: true,
      directVisitPolicy: 'replay'
    },
    afterComplete: {
      markTargetPresented: true,
      scrollTo: '#contact',
      snapToVisualStart: true,
      cleanupGhosts: true
    },
    reducedMotion: {
      policy: 'jump-to-presented'
    }
  }
];

export const timelineScenes = [
  {
    id: 'home',
    role: 'source',
    sectionId: 'home',
    sectionSelector: '#home',
    copySelectors: [
      {
        selector: '.hero-content',
        unique: true
      }
    ]
  },
  {
    id: 'belief',
    role: 'target',
    sectionId: 'belief',
    sectionSelector: '#belief',
    sceneTarget: 'belief',
    allowSectionOwner: false,
    copySelectors: [
      {
        selector: '.belief-copy-wrap',
        entryOwner: 'timeline',
        unique: true
      }
    ]
  },
  {
    id: 'method',
    role: 'target',
    sectionId: 'method',
    sectionSelector: '#method',
    sceneTarget: 'method',
    allowSectionOwner: false,
    copySelectors: [
      {
        selector: '.method-edition-layout--after-handoff',
        entryOwner: 'timeline',
        unique: true
      }
    ]
  },
  {
    id: 'method-proof',
    role: 'source-only',
    sceneSelector: '[data-scene-id="method-proof"]',
    sourceOnly: true,
    copySelectors: [
      {
        selector: '.method-proof',
        unique: true
      }
    ]
  },
  {
    id: 'brand',
    role: 'target',
    sectionId: 'brand',
    sectionSelector: '#brand',
    sceneTarget: 'brand',
    allowSectionOwner: false,
    copySelectors: [
      {
        selector: '.brand-definition-grid',
        entryOwner: 'timeline',
        unique: true
      }
    ]
  },
  {
    id: 'services',
    role: 'target',
    sectionId: 'services',
    sectionSelector: '#services',
    sceneTarget: 'services',
    allowSectionOwner: false,
    copySelectors: [
      {
        selector: '.enterprise-vertical-layout',
        entryOwner: 'timeline',
        unique: true
      }
    ]
  },
  {
    id: 'lab',
    role: 'target',
    sectionId: 'lab',
    sectionSelector: '#lab',
    sceneTarget: 'lab',
    allowSectionOwner: false,
    copySelectors: [
      {
        selector: '.scenario-wide-stage',
        entryOwner: 'timeline',
        unique: true
      }
    ]
  },
  {
    id: 'education',
    role: 'target',
    sectionId: 'education',
    sectionSelector: '#education',
    sceneTarget: 'education',
    allowSectionOwner: false,
    copySelectors: [
      {
        selector: '.education-wide-stage',
        entryOwner: 'timeline',
        unique: true
      }
    ]
  },
  {
    id: 'philosophy',
    role: 'target',
    sectionId: 'philosophy',
    sectionSelector: '#philosophy',
    sceneTarget: 'philosophy',
    allowSectionOwner: false,
    copySelectors: [
      {
        selector: '.philosophy-list',
        entryOwner: 'timeline',
        unique: true
      }
    ]
  },
  {
    id: 'contact',
    role: 'target',
    sectionId: 'contact',
    sectionSelector: '#contact',
    sceneTarget: 'contact',
    allowSectionOwner: false,
    copySelectors: [
      {
        selector: '.contact-endpoint',
        entryOwner: 'timeline',
        unique: true
      }
    ]
  }
];

export const timelineJoins = [
  {
    id: 'home-belief',
    transitionId: 'home-belief',
    handoffId: 'home-belief',
    hostSelector: '[data-transition-id="home-belief"]',
    progressPolicy: 'scroll',
    fromScene: 'home',
    toScene: 'belief',
    sourceOut: [0.72, 0.98],
    targetIn: [0.72, 0.84],
    commitAt: 0.72,
    presentAt: 0.84,
    cleanupAt: 0.96,
    targetCopyPolicy: 'scroll-owner',
    commitCondition: ['progress:commitAt', 'lotusContracted', 'targetReady'],
    presentCondition: ['progress:presentAt', 'beliefCopyComplete'],
    phases: {
      reveal: [0.00, 0.46],
      bloom: [0.42, 0.70],
      secondReveal: [0.72, 0.84]
    },
    handoffOverlaps: [['reveal', 'bloom']],
    adapterVariant: 'perlin-no-stretch-centered-copy'
  },
  {
    id: 'belief-method',
    transitionId: 'belief-method',
    handoffId: 'belief-method',
    hostSelector: '[data-transition-id="belief-method"]',
    progressPolicy: 'snap-playback',
    fromScene: 'belief',
    toScene: 'method',
    sourceOut: [0.72, 0.96],
    targetIn: [0.62, 0.82],
    commitAt: 0.72,
    presentAt: 0.92,
    cleanupAt: 0.96,
    targetCopyPolicy: 'early',
    presentCondition: ['progress:presentAt', 'targetReady'],
    adapterVariant: 'measure-order'
  },
  {
    id: 'method-proof-brand',
    transitionId: 'method-tooling__method-proof',
    handoffId: 'method-proof-brand',
    hostSelector: '[data-transition-id="method-tooling__method-proof"]',
    progressPolicy: 'snap-playback-post-scroll',
    fromScene: 'method-proof',
    toScene: 'brand',
    sourceOut: [0.72, 0.96],
    targetIn: [0.40, 0.72],
    commitAt: 0.72,
    presentAt: 0.78,
    cleanupAt: 0.94,
    targetCopyPolicy: 'terminal',
    presentCondition: ['runtimeHandoffComplete'],
    sourceOnlyGhosts: ['.method-proof'],
    adapterVariant: 'questioning'
  },
  {
    id: 'brand-services',
    transitionId: 'brand-services',
    hostSelector: '[data-transition-id="brand-services"]',
    progressPolicy: 'snap-playback',
    fromScene: 'brand',
    toScene: 'services',
    sourceOut: [0.72, 0.96],
    targetIn: [0.78, 0.92],
    commitAt: 0.80,
    presentAt: 0.92,
    cleanupAt: 0.96,
    targetCopyPolicy: 'early',
    presentCondition: ['progress:presentAt', 'targetReady'],
    adapterVariant: 'fabric-menu'
  },
  {
    id: 'services-lab',
    transitionId: 'services-lab',
    hostSelector: '[data-transition-id="services-lab"]',
    progressPolicy: 'snap-playback',
    fromScene: 'services',
    toScene: 'lab',
    sourceOut: [0.72, 0.96],
    targetIn: [0.42, 0.72],
    commitAt: 0.72,
    presentAt: 0.78,
    cleanupAt: 0.90,
    targetCopyPolicy: 'terminal',
    presentCondition: ['progress:presentAt', 'playbackComplete'],
    adapterVariant: 'structure-field'
  },
  {
    id: 'lab-education',
    transitionId: 'lab-education',
    hostSelector: '[data-transition-id="lab-education"]',
    progressPolicy: 'snap-playback',
    fromScene: 'lab',
    toScene: 'education',
    sourceOut: [0.72, 0.96],
    targetIn: [0.42, 0.72],
    commitAt: 0.72,
    presentAt: 0.78,
    cleanupAt: 0.90,
    targetCopyPolicy: 'terminal',
    presentCondition: ['progress:presentAt', 'playbackComplete'],
    adapterVariant: 'learning-sun'
  },
  {
    id: 'education-philosophy',
    transitionId: 'education-philosophy',
    hostSelector: '[data-transition-id="education-philosophy"]',
    progressPolicy: 'snap-playback',
    fromScene: 'education',
    toScene: 'philosophy',
    sourceOut: [0.72, 0.96],
    targetIn: [0.52, 0.82],
    commitAt: 0.78,
    presentAt: 0.84,
    cleanupAt: 0.94,
    targetCopyPolicy: 'terminal',
    presentCondition: ['progress:presentAt', 'playbackComplete'],
    adapterVariant: 'quiet-values'
  },
  {
    id: 'philosophy-contact',
    transitionId: 'philosophy-contact',
    handoffId: 'philosophy-contact',
    hostSelector: '[data-transition-id="philosophy-contact"]',
    progressPolicy: 'snap-playback',
    fromScene: 'philosophy',
    toScene: 'contact',
    sourceOut: [0.72, 0.96],
    targetIn: [0.78, 0.92],
    commitAt: 0.80,
    presentAt: 0.92,
    cleanupAt: 0.96,
    targetCopyPolicy: 'early',
    presentCondition: ['progress:presentAt', 'targetReady'],
    adapterVariant: 'forward-motion'
  }
];

export const executableTransitionModules = [
  'soft-divider',
  'soft-drilldown',
  'soft-breath',
  'aod',
  'figure2',
  'pattern-bloom',
  'ttg',
  'figure3-transition',
  'ph',
  'crane'
];

export const homepageTimeline = {
  version: 1,
  defaults: {
    snap: {
      mode: 'full-screen',
      triggerAfterSnapVh: 10,
      releaseCooldownMs: 420
    },
    media: {
      playback: 'autoplay',
      seekPolicy: 'reset-only',
      muted: true,
      playsInline: true
    },
    timeouts: {
      mediaReadyMs: 1800,
      mediaPlayMs: 1600,
      mediaEndGraceMs: 1200,
      textureReadyMs: 1200
    }
  },
  scenes: [
    {
      id: 'hero',
      kind: 'reading',
      publicSectionId: 'home',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: false }
    },
    {
      id: 'pattern-bloom',
      kind: 'animation',
      visual: 'pattern-bloom',
      fullScreen: true,
      snap: { enter: true }
    },
    {
      id: 'belief-star',
      kind: 'reading',
      publicSectionId: 'belief',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true }
    },
    {
      id: 'aod-animation',
      kind: 'animation',
      visual: 'aod',
      fullScreen: true,
      snap: { enter: true },
      copy: {
        targetScene: 'method-upper',
        enterAtRemaining: 0.2
      }
    },
    {
      id: 'method-upper',
      kind: 'reading',
      publicSectionId: 'method',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true }
    },
    {
      id: 'method-lower',
      kind: 'reading',
      publicSectionId: 'method',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true, overflow: 'extend', armNextAt: 'scrolled-past-bottom' }
    },
    {
      id: 'figure2-animation',
      kind: 'animation',
      visual: 'figure2',
      fullScreen: true,
      snap: { enter: true },
      stages: ['camera-expand', 'arch-with-cards', 'arch-with-closing', 'ink-sweep']
    },
    {
      id: 'figure2-proof-cards',
      kind: 'reading',
      publicSectionId: 'method-proof',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true },
      content: { source: 'fixture', ref: 'proof-cards-122-126' }
    },
    {
      id: 'figure2-proof-closing',
      kind: 'reading',
      publicSectionId: 'method-proof',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: false },
      content: { source: 'fixture', ref: 'proof-closing-128' }
    },
    {
      id: 'brand',
      kind: 'reading',
      publicSectionId: 'brand',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true },
      content: { source: 'fixture', ref: 'brand-135-136' }
    },
    {
      id: 'figure3-animation',
      kind: 'animation',
      visual: 'figure3',
      fullScreen: true,
      snap: { enter: true },
      copy: {
        targetScene: 'services',
        enterAtRemaining: 0.2
      }
    },
    {
      id: 'services',
      kind: 'reading',
      publicSectionId: 'services',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true, overflow: 'extend', armNextAt: 'scrolled-past-bottom' }
    },
    {
      id: 'ttg-animation',
      kind: 'animation',
      visual: 'ttg',
      fullScreen: true,
      snap: { enter: true }
    },
    {
      id: 'lab',
      kind: 'reading',
      publicSectionId: 'lab',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true }
    },
    {
      id: 'ph-animation',
      kind: 'animation',
      visual: 'ph',
      fullScreen: true,
      snap: { enter: true }
    },
    {
      id: 'education',
      kind: 'reading',
      publicSectionId: 'education',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true }
    },
    {
      id: 'philosophy',
      kind: 'reading',
      publicSectionId: 'philosophy',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true }
    },
    {
      id: 'crane-animation',
      kind: 'animation',
      visual: 'crane',
      fullScreen: true,
      snap: { enter: true },
      copy: {
        targetScene: 'contact',
        enterAtRemaining: 0.2
      }
    },
    {
      id: 'contact',
      kind: 'reading',
      publicSectionId: 'contact',
      fullScreen: true,
      snap: { enter: true },
      reading: { allowNativeScroll: true }
    }
  ],
  blocks: [
    {
      id: 'hero-to-pattern',
      type: 'ink-transition',
      fromScene: 'hero',
      toScene: 'pattern-bloom',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'radial-center', direction: 'expand' },
      textureSource: { type: 'canvasProjection', targetScene: 'pattern-bloom' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'pattern-to-belief',
      type: 'ink-transition',
      fromScene: 'pattern-bloom',
      toScene: 'belief-star',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'radial-rotating-left', direction: 'expand' },
      textureSource: { type: 'asset', path: 'assets/back2.png' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'belief-to-aod',
      type: 'ink-transition',
      fromScene: 'belief-star',
      toScene: 'aod-animation',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'bottom-up' },
      textureSource: { type: 'canvasProjection', targetScene: 'aod-animation' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'aod-play',
      type: 'media-animation',
      scene: 'aod-animation',
      snap: { triggerAfterSnapVh: 10 },
      media: ['aod-measure-order'],
      copy: {
        targetScene: 'method-upper',
        enterAtRemaining: 0.2
      },
      reverse: { strategy: 'terminal-state-fallback', targetScene: 'belief-star' }
    },
    {
      id: 'method-lower-to-figure2',
      type: 'ink-transition',
      fromScene: 'method-lower',
      toScene: 'figure2-animation',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'bottom-up' },
      textureSource: { type: 'canvasProjection', targetScene: 'figure2-animation' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'figure2-play',
      type: 'media-animation',
      scene: 'figure2-animation',
      snap: { triggerAfterSnapVh: 10 },
      media: ['figure2-arch-camera'],
      reverse: { strategy: 'reverse-media', media: ['figure2-arch-camera-reverse'] }
    },
    {
      id: 'figure2-proof-to-brand',
      type: 'ink-transition',
      fromScene: 'figure2-proof-closing',
      toScene: 'brand',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'bottom-up' },
      textureSource: { type: 'canvasProjection', targetScene: 'brand' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'brand-to-figure3',
      type: 'ink-transition',
      fromScene: 'brand',
      toScene: 'figure3-animation',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'bottom-up' },
      textureSource: { type: 'canvasProjection', targetScene: 'figure3-animation' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'figure3-play',
      type: 'media-animation',
      scene: 'figure3-animation',
      snap: { triggerAfterSnapVh: 10 },
      media: ['figure3-fabric'],
      copy: {
        targetScene: 'services',
        enterAtRemaining: 0.2
      },
      reverse: { strategy: 'terminal-state-fallback', targetScene: 'brand' }
    },
    {
      id: 'services-to-ttg',
      type: 'ink-transition',
      fromScene: 'services',
      toScene: 'ttg-animation',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'bottom-up' },
      textureSource: { type: 'canvasProjection', targetScene: 'ttg-animation' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'ttg-play',
      type: 'media-animation',
      scene: 'ttg-animation',
      snap: { triggerAfterSnapVh: 10 },
      media: ['ttg-figure-alpha-scrub'],
      reverse: { strategy: 'reverse-media', media: ['ttg-figure-alpha-scrub-reverse'] }
    },
    {
      id: 'ttg-to-lab',
      type: 'ink-transition',
      fromScene: 'ttg-animation',
      toScene: 'lab',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'top-down' },
      textureSource: { type: 'canvasProjection', targetScene: 'lab' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'lab-to-ph',
      type: 'ink-transition',
      fromScene: 'lab',
      toScene: 'ph-animation',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'sunburst-radial', direction: 'expand', sourceUV: { x: 0.0977, y: 0.6476 } },
      textureSource: { type: 'asset', path: 'assets/ph_background.png' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'ph-play',
      type: 'media-animation',
      scene: 'ph-animation',
      snap: { triggerAfterSnapVh: 10 },
      media: ['ph-learning-sun'],
      reverse: { strategy: 'terminal-state-fallback', targetScene: 'lab' }
    },
    {
      id: 'ph-to-education',
      type: 'ink-transition',
      fromScene: 'ph-animation',
      toScene: 'education',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'top-down' },
      textureSource: { type: 'canvasProjection', targetScene: 'education' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'education-to-philosophy',
      type: 'ink-transition',
      fromScene: 'education',
      toScene: 'philosophy',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'bottom-up' },
      textureSource: { type: 'canvasProjection', targetScene: 'philosophy' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'philosophy-to-crane',
      type: 'ink-transition',
      fromScene: 'philosophy',
      toScene: 'crane-animation',
      snap: { triggerAfterSnapVh: 10 },
      lock: { during: ['playback'], release: 'complete' },
      ink: { type: 'horizontal-irregular', direction: 'bottom-up' },
      textureSource: { type: 'canvasProjection', targetScene: 'crane-animation' },
      reverse: { strategy: 'reverse-ink-to-previous-terminal' }
    },
    {
      id: 'crane-play',
      type: 'media-animation',
      scene: 'crane-animation',
      snap: { triggerAfterSnapVh: 10 },
      media: ['crane-figure1', 'crane-figure2'],
      copy: {
        targetScene: 'contact',
        enterAtRemaining: 0.2
      },
      reverse: { strategy: 'terminal-state-fallback', targetScene: 'philosophy' }
    }
  ]
};

/**
 * Explicit map from homepageTimeline scene id -> existing DOM node to annotate
 * with `data-scene-id` at build time. This is the single source of truth for
 * scene-to-DOM mapping; the build does NOT guess. Each `selector` must resolve
 * to exactly one node in the built HTML (build asserts this).
 *
 * mode is advisory metadata describing why the node was chosen:
 *  - 'section' : a full <section> reading scene maps onto the existing section
 *  - 'host'    : an animation scene maps onto its existing chapter/scene
 *                transition host (where the visual adapter already mounts)
 *  - 'anchor'  : a sub-region split out of a shared section (e.g. method
 *                upper/lower) onto an existing structural anchor
 *
 * Only the 6 pilot scenes are mapped today; non-pilot scenes are added as later
 * phases scaffold them. Scenes absent here simply have no DOM host yet and the
 * runtime treats them as inactive.
 */
export const homepageSceneDomMap = [
  { sceneId: 'hero', selector: '#home', mode: 'section' },
  { sceneId: 'pattern-bloom', selector: '[data-transition-id="home-belief"]', mode: 'host' },
  { sceneId: 'belief-star', selector: '#belief', mode: 'section' },
  { sceneId: 'aod-animation', selector: '[data-transition-id="belief-method"]', mode: 'host' },
  { sceneId: 'method-upper', selector: '.chapter-intro--method', mode: 'anchor' },
  { sceneId: 'method-lower', selector: '.method-flow', mode: 'anchor' },

  // Batch 2 — only the structurally clean hosts (1 scene : 1 node, physical
  // order matches manifest order). Deliberately NOT scaffolded here:
  //  - figure2-proof-cards / figure2-proof-closing: live in one .method-proof
  //    block in REVERSED order (closing above cards); splitting + reordering is
  //    designed together with the figure2 multi-stage adapter.
  //  - brand maps to its section as a HOST only; its copy is still main's
  //    同野/观幂 two-card grid, not the fixture (brand-135-136). Content
  //    migration remains a tracked pending gap — host coverage != content done.
  { sceneId: 'figure2-animation', selector: '[data-transition-id="method-tooling__method-proof"]', mode: 'host' },
  // Proof content split into two reading scenes. The source template
  // (src/sections/method.html) was reordered so cards (.method-proof__list)
  // physically precede closing (.method-proof__lead), matching manifest scene
  // order figure2-proof-cards -> figure2-proof-closing so the runtime's
  // position-sorted bounds stay monotonic.
  { sceneId: 'figure2-proof-cards', selector: '.method-proof__list', mode: 'anchor' },
  { sceneId: 'figure2-proof-closing', selector: '.method-proof__lead', mode: 'anchor' },
  { sceneId: 'brand', selector: '.canvas-section--brand', mode: 'section' },
  { sceneId: 'services', selector: '#services', mode: 'section' }
];
