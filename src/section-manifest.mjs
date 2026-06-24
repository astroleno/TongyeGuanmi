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
    variant: 'fabric-menu'
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
    targetIn: [0.58, 0.92],
    commitAt: 0.86,
    presentAt: 0.92,
    cleanupAt: 0.98,
    commitCondition: ['progress:commitAt', 'lotusContracted', 'targetReady'],
    presentCondition: ['progress:presentAt', 'beliefCopyComplete'],
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
    targetIn: [0.64, 0.92],
    commitAt: 0.86,
    presentAt: 0.92,
    cleanupAt: 0.98,
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
    targetIn: [0.62, 0.9],
    commitAt: 0.9,
    presentAt: 0.9,
    cleanupAt: 0.98,
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
    targetIn: [0.68, 0.94],
    commitAt: 0.9,
    presentAt: 0.94,
    cleanupAt: 0.98,
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
    targetIn: [0.68, 0.94],
    commitAt: 0.9,
    presentAt: 0.94,
    cleanupAt: 0.98,
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
    targetIn: [0.68, 0.94],
    commitAt: 0.9,
    presentAt: 0.94,
    cleanupAt: 0.98,
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
    targetIn: [0.68, 0.94],
    commitAt: 0.9,
    presentAt: 0.94,
    cleanupAt: 0.98,
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
    targetIn: [0.72, 0.9],
    commitAt: 0.88,
    presentAt: 0.9,
    cleanupAt: 0.98,
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
