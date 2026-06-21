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
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'brand',
    match: 'canvas-section--brand',
    navLabel: '',
    includeInNav: false,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'services',
    match: 'id="services"',
    navLabel: '场景',
    includeInNav: true,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'lab',
    match: 'id="lab"',
    navLabel: '',
    includeInNav: false,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'education',
    match: 'id="education"',
    navLabel: '留学',
    includeInNav: true,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'philosophy',
    match: 'id="philosophy"',
    navLabel: '',
    includeInNav: false,
    theme: 'dark',
    navBg: 'solid',
    layout: 'editorial-flat'
  },
  {
    id: 'contact',
    match: 'id="contact"',
    navLabel: '联系',
    includeInNav: true,
    theme: 'dark',
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
    variant: 'lotus-manifesto'
  },
  {
    id: 'belief-method',
    from: 'belief',
    to: 'method-field-law',
    module: 'aod',
    variant: 'measure-order'
  },
  {
    id: 'method-brand',
    from: 'method-tooling',
    to: 'brand',
    module: 'ttg',
    variant: 'structure-field'
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
    module: 'soft-drilldown',
    variant: 'cards-to-scenarios'
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
    variant: 'forward-motion'
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
