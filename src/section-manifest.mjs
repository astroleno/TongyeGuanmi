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
