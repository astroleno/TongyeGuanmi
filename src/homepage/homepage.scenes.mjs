export const homepageSceneOrder = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'method-bottom',
  'figure2-animation',
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
];

export const homepageScenes = [
  {
    id: 'hero',
    kind: 'opening',
    source: 'src/sections/hero.html',
    legacyRefs: ['#home'],
    hash: '#home',
    owner: 'Presentation'
  },
  {
    id: 'pattern',
    kind: 'visual',
    source: 'js/pattern-mirror-stage.js',
    legacyRefs: ['home-belief pattern bloom'],
    owner: 'Presentation'
  },
  {
    id: 'star-map',
    kind: 'visual',
    source: 'src/sections/belief.html',
    legacyRefs: ['#belief'],
    owner: 'Presentation'
  },
  {
    id: 'aod-animation',
    kind: 'animation',
    source: 'js/transitions/homepage/aod-homepage-adapter.js',
    legacyRefs: ['belief-method'],
    playSegmentId: 'aod-play',
    owner: 'Presentation'
  },
  {
    id: 'method-top',
    kind: 'reading',
    source: 'src/sections/method.html',
    legacyRefs: ['.chapter-intro--method', '#method'],
    hash: '#method',
    read: {
      role: 'intro',
      enterWhen: 'top-crosses-viewport-center',
      completeWhen: 'bottom-crosses-viewport-bottom'
    },
    owner: 'Presentation'
  },
  {
    id: 'method-bottom',
    kind: 'reading',
    source: 'src/sections/method.html',
    legacyRefs: ['.method-flow', 'method-cocreation', 'method-tooling'],
    read: {
      role: 'long-reading',
      enterWhen: 'top-crosses-viewport-center',
      completeWhen: 'bottom-crosses-viewport-bottom',
      nextArm: 'after-bottom-plus-intent'
    },
    owner: 'Presentation'
  },
  {
    id: 'figure2-animation',
    kind: 'animation',
    source: 'js/transitions/homepage/figure2-homepage-adapter.js',
    legacyRefs: ['method-tooling__method-proof'],
    playSegmentId: 'figure2-compound-to-brand',
    owner: 'Presentation',
    compoundStepIds: ['camera-expand', 'arch-with-cards', 'arch-with-closing', 'ink-sweep-to-brand'],
    contentRefs: ['method-proof', 'proof-cards-122-126', 'proof-closing-128']
  },
  {
    id: 'brand',
    kind: 'reading',
    source: 'src/sections/brand.html',
    legacyRefs: ['#brand'],
    hash: '#brand',
    contentRefs: ['brand-135-136'],
    owner: 'Presentation'
  },
  {
    id: 'figure3-animation',
    kind: 'animation',
    source: 'js/transitions/homepage/figure3-homepage-adapter.js',
    legacyRefs: ['brand-services'],
    playSegmentId: 'figure3-play',
    owner: 'Presentation'
  },
  {
    id: 'services',
    kind: 'reading',
    source: 'src/sections/services.html',
    legacyRefs: ['#services'],
    hash: '#services',
    read: {
      role: 'long-reading',
      enterWhen: 'top-crosses-viewport-center',
      completeWhen: 'bottom-crosses-viewport-bottom',
      nextArm: 'after-bottom-plus-intent'
    },
    owner: 'Presentation'
  },
  {
    id: 'ttg-animation',
    kind: 'animation',
    source: 'js/transitions/homepage/ttg-homepage-adapter.js',
    legacyRefs: ['services-lab'],
    playSegmentId: 'ttg-play',
    owner: 'Presentation'
  },
  {
    id: 'lab',
    kind: 'reading',
    source: 'src/sections/lab.html',
    legacyRefs: ['#lab'],
    hash: '#lab',
    owner: 'Presentation'
  },
  {
    id: 'ph-animation',
    kind: 'animation',
    source: 'js/transitions/homepage/ph-homepage-adapter.js',
    legacyRefs: ['lab-education'],
    playSegmentId: 'ph-play',
    owner: 'Presentation'
  },
  {
    id: 'education',
    kind: 'reading',
    source: 'src/sections/education.html',
    legacyRefs: ['#education', '#philosophy legacy target'],
    hash: '#education',
    owner: 'Presentation'
  },
  {
    id: 'crane-animation',
    kind: 'animation',
    source: 'js/transitions/homepage/crane-homepage-adapter.js',
    legacyRefs: ['philosophy-contact visual'],
    playSegmentId: 'crane-play',
    owner: 'Presentation'
  },
  {
    id: 'contact',
    kind: 'reading',
    source: 'src/sections/contact.html',
    legacyRefs: ['#contact'],
    hash: '#contact',
    owner: 'Presentation'
  }
];

export const figure2InternalSteps = [
  {
    id: 'camera-expand',
    source: 'figure2-animation',
    owner: 'SegmentPlayer',
    contentRefs: []
  },
  {
    id: 'arch-with-cards',
    source: 'figure2-animation',
    owner: 'SegmentPlayer',
    contentRefs: ['proof-cards-122-126']
  },
  {
    id: 'arch-with-closing',
    source: 'figure2-animation',
    owner: 'SegmentPlayer',
    contentRefs: ['proof-closing-128']
  },
  {
    id: 'ink-sweep-to-brand',
    source: 'figure2-animation',
    owner: 'SegmentPlayer',
    contentRefs: ['brand-135-136']
  }
];
