export const homepageSegmentOrder = [
  'hero-to-pattern',
  'pattern-to-star-map',
  'star-map-to-aod',
  'aod-play',
  'method-read',
  'method-bottom-to-figure2',
  'figure2-compound-to-brand',
  'brand-to-figure3',
  'figure3-play',
  'services-to-ttg',
  'ttg-play',
  'ttg-to-lab',
  'lab-to-ph',
  'ph-play',
  'ph-to-education',
  'education-to-crane',
  'crane-play'
];

const forwardIntent = Object.freeze({
  distanceVh: 10,
  direction: 'forward',
  source: 'ScrollIntent'
});

export const homepageSegments = [
  {
    id: 'hero-to-pattern',
    type: 'ink-transition',
    from: 'hero',
    to: 'pattern',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'pattern-bloom', variant: 'radial-center-reveal' }
  },
  {
    id: 'pattern-to-star-map',
    type: 'ink-transition',
    from: 'pattern',
    to: 'star-map',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'pattern-bloom', variant: 'rotating-left-exit' }
  },
  {
    id: 'star-map-to-aod',
    type: 'ink-transition',
    from: 'star-map',
    to: 'aod-animation',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'horizontal-irregular-ink', direction: 'bottom-up' }
  },
  {
    id: 'aod-play',
    type: 'media-animation',
    from: 'aod-animation',
    to: 'method-top',
    completion: 'present-next',
    intent: forwardIntent,
    player: 'aod',
    earlyCopyAt: 0.8
  },
  {
    id: 'method-read',
    type: 'text-read',
    from: 'method-top',
    to: 'method-bottom',
    completion: 'read-complete',
    lockScroll: false,
    player: null,
    read: {
      driver: 'ReadMonitor',
      enterWhen: 'top-crosses-viewport-center',
      completeWhen: 'bottom-crosses-viewport-bottom',
      nextArm: 'after-bottom-plus-intent'
    }
  },
  {
    id: 'method-bottom-to-figure2',
    type: 'ink-transition',
    from: 'method-bottom',
    to: 'figure2-animation',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'horizontal-irregular-ink', direction: 'bottom-up' }
  },
  {
    id: 'figure2-compound-to-brand',
    type: 'compound-sequence',
    from: 'figure2-animation',
    to: 'brand',
    completion: 'present-next',
    intent: forwardIntent,
    compound: {
      onlyTopLevelCompound: true,
      awaitIntent: { distanceVh: 10, direction: 'forward' },
      steps: ['camera-expand', 'arch-with-cards', 'arch-with-closing', 'ink-sweep-to-brand']
    }
  },
  {
    id: 'brand-to-figure3',
    type: 'ink-transition',
    from: 'brand',
    to: 'figure3-animation',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'horizontal-irregular-ink', direction: 'bottom-up' }
  },
  {
    id: 'figure3-play',
    type: 'media-animation',
    from: 'figure3-animation',
    to: 'services',
    completion: 'present-next',
    intent: forwardIntent,
    player: 'figure3',
    earlyCopyAt: 0.8
  },
  {
    id: 'services-to-ttg',
    type: 'ink-transition',
    from: 'services',
    to: 'ttg-animation',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'horizontal-irregular-ink', direction: 'bottom-up' }
  },
  {
    id: 'ttg-play',
    type: 'media-animation',
    from: 'ttg-animation',
    to: 'ttg-animation',
    completion: 'hold-current',
    intent: forwardIntent,
    player: 'ttg'
  },
  {
    id: 'ttg-to-lab',
    type: 'ink-transition',
    from: 'ttg-animation',
    to: 'lab',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'horizontal-irregular-ink', direction: 'top-down' }
  },
  {
    id: 'lab-to-ph',
    type: 'ink-transition',
    from: 'lab',
    to: 'ph-animation',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'sun-point-radial-ink', origin: 'ph-sun' }
  },
  {
    id: 'ph-play',
    type: 'media-animation',
    from: 'ph-animation',
    to: 'ph-animation',
    completion: 'hold-current',
    intent: forwardIntent,
    player: 'ph'
  },
  {
    id: 'ph-to-education',
    type: 'ink-transition',
    from: 'ph-animation',
    to: 'education',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'horizontal-irregular-ink', direction: 'top-down' }
  },
  {
    id: 'education-to-crane',
    type: 'ink-transition',
    from: 'education',
    to: 'crane-animation',
    completion: 'present-next',
    intent: forwardIntent,
    visual: { family: 'horizontal-irregular-ink', direction: 'bottom-up' }
  },
  {
    id: 'crane-play',
    type: 'media-animation',
    from: 'crane-animation',
    to: 'contact',
    completion: 'present-next',
    intent: forwardIntent,
    player: 'crane',
    earlyCopyAt: 0.8
  }
];
