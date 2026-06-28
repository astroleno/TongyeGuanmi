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
    runtimeMode: 'progress-window',
    progressStartAnchor: '#belief',
    progressEndAnchor: '#method',
    startOffsetVh: 0,
    endOffsetVh: -0.12,
    handoffTarget: '#method',
    handoffPhase: 'after-playback',
    preserveEntry: true,
    windows: [
      { name: 'belief-aod-split', from: 0, to: 0.24, bridge: 'splitSceneBridge', topOwner: 'belief', bottomOwner: 'aod', commitOwner: 'aod', priority: 20 },
      { name: 'aod-scene', from: 0.20, to: 0.78, owner: 'aod', priority: 10 },
      { name: 'aod-method-receiver', from: 0.68, to: 1, bridge: 'earlyReceiver', primaryOwner: 'aod', receiverOwner: 'method', commitOwner: 'method', priority: 20 }
    ],
    contract: {
      id: 'belief-method',
      mode: 'progress-window',
      bridgeType: 'splitSceneBridge',
      snapPolicy: {
        allowed: true,
        target: '#method',
        tolerancePx: 8
      },
      phases: [
        { id: 'entryInk', start: 0, end: 0.18, required: true },
        { id: 'scene', start: 0.18, end: 0.42, required: true },
        { id: 'copyIn', start: 0.22, end: 0.52, required: true },
        { id: 'copyHold', start: 0.52, end: 0.94, required: true },
        { id: 'handoff', start: 0.94, end: 1, required: true }
      ],
      handoff: {
        receiver: '#method',
        targetSection: '#method'
      }
    }
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
    runtimeMode: 'progress-window',
    progressStartAnchor: '#brand',
    progressEndAnchor: '#services',
    startOffsetVh: 0,
    endOffsetVh: -0.12,
    windows: [
      { name: 'brand-copy', from: 0, to: 0.20, owner: 'brand', priority: 10 },
      { name: 'figure3-scene', from: 0.16, to: 0.82, owner: 'figure3', priority: 10 },
      { name: 'figure3-services-receiver', from: 0.68, to: 1, bridge: 'earlyReceiver', primaryOwner: 'figure3', receiverOwner: 'services', commitOwner: 'services', priority: 20 }
    ]
  },
  {
    id: 'services-lab',
    from: 'services',
    to: 'lab',
    module: 'ttg',
    variant: 'structure-field',
    runtimeMode: 'progress-window',
    progressStartAnchor: '#services',
    progressEndAnchor: '#lab',
    startOffsetVh: 0,
    endOffsetVh: -0.15,
    windows: [
      { name: 'services-copy', from: 0, to: 0.18, owner: 'services', priority: 10 },
      { name: 'services-ttg-split', from: 0.16, to: 0.42, bridge: 'splitSceneBridge', topOwner: 'services', bottomOwner: 'ttg', commitOwner: 'ttg', priority: 20 },
      { name: 'ttg-scene', from: 0.40, to: 0.72, owner: 'ttg', priority: 10 },
      { name: 'ttg-lab-split', from: 0.70, to: 1, bridge: 'splitSceneBridge', topOwner: 'ttg', bottomOwner: 'lab', commitOwner: 'lab', priority: 20 }
    ]
  },
  {
    id: 'lab-education',
    from: 'lab',
    to: 'education',
    module: 'ph',
    variant: 'learning-sun',
    runtimeMode: 'progress-window',
    progressStartAnchor: '#lab',
    progressEndAnchor: '#education',
    startOffsetVh: 0,
    endOffsetVh: -0.15,
    windows: [
      { name: 'lab-copy', from: 0, to: 0.18, owner: 'lab', priority: 10 },
      { name: 'lab-ph-split', from: 0.16, to: 0.42, bridge: 'splitSceneBridge', topOwner: 'lab', bottomOwner: 'ph', commitOwner: 'ph', priority: 20 },
      { name: 'ph-scene', from: 0.40, to: 0.72, owner: 'ph', priority: 10 },
      { name: 'ph-education-split', from: 0.70, to: 1, bridge: 'splitSceneBridge', topOwner: 'ph', bottomOwner: 'education', commitOwner: 'education', priority: 20 }
    ]
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
    runtimeMode: 'progress-window',
    progressStartAnchor: '#philosophy',
    progressEndAnchor: '#contact',
    startOffsetVh: 0,
    endOffsetVh: -0.12,
    windows: [
      { name: 'philosophy-copy', from: 0, to: 0.18, owner: 'philosophy', priority: 10 },
      { name: 'philosophy-crane-split', from: 0.16, to: 0.42, bridge: 'splitSceneBridge', topOwner: 'philosophy', bottomOwner: 'crane', commitOwner: 'crane', priority: 20 },
      { name: 'crane-scene', from: 0.40, to: 0.82, owner: 'crane', priority: 10 },
      { name: 'crane-contact-receiver', from: 0.70, to: 1, bridge: 'earlyReceiver', primaryOwner: 'crane', receiverOwner: 'contact', commitOwner: 'contact', priority: 20 }
    ],
    handoffTarget: '#contact',
    handoffPhase: 'after-playback'
  }
];

export const sceneTransitionContracts = [
  {
    id: 'method-tooling__method-proof',
    mode: 'progress-window',
    runtimeMode: 'progress-window',
    bridgeType: 'splitSceneBridge',
    progressStartAnchor: '#method',
    progressEndAnchor: '#brand',
    startOffsetVh: 0,
    endOffsetVh: -0.12,
    windows: [
      { name: 'method-figure2-split', from: 0, to: 0.24, bridge: 'splitSceneBridge', topOwner: 'method', bottomOwner: 'figure2', commitOwner: 'figure2', priority: 20 },
      { name: 'figure2-scene', from: 0.20, to: 0.72, owner: 'figure2', priority: 10 },
      { name: 'figure2-brand-split', from: 0.70, to: 1, bridge: 'splitSceneBridge', topOwner: 'figure2', bottomOwner: 'brand', commitOwner: 'brand', priority: 20 }
    ],
    phases: [
      { id: 'entry', start: 0, end: 0.05, required: true },
      { id: 'exitInk', start: 0.05, end: 0.72, required: true },
      { id: 'proofCopy', start: 0.72, end: 0.96, required: true },
      { id: 'handoff', start: 0.96, end: 1, required: true }
    ],
    handoff: {
      receiver: '#brand',
      targetSection: '#brand'
    }
  }
];

export const homepageEndpointSpec = {
  mode: 'contact-only',
  snapTarget: '#contact',
  footerVisibleRatioMin: 0,
  footerVisibleRatioMax: 0.12,
  tolerancePx: 8,
  approvalSource: '2026-06-28-v31-contact-only-endpoint'
};

export const HOMEPAGE_ENDPOINT_CHOICES = {
  contactOnly: {
    mode: 'contact-only',
    snapTarget: '#contact',
    footerVisibleRatioMin: 0,
    footerVisibleRatioMax: 0.12,
    tolerancePx: 8,
    approvalSource: '2026-06-28-v31-contact-only-endpoint'
  },
  contactFooterComposed: {
    mode: 'contact-footer-composed',
    snapTarget: '#contact',
    footerVisibleRatioMin: 0.97,
    footerVisibleRatioMax: 1,
    tolerancePx: 8,
    approvalSource: ''
  }
};

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
