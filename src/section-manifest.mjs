export const contentSections = [
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
    id: 'method-brand',
    from: 'method',
    to: 'brand',
    module: 'soft-divider',
    variant: 'fine-rule'
  },
  {
    id: 'brand-services',
    from: 'brand',
    to: 'services',
    module: 'soft-divider',
    variant: 'breath'
  },
  {
    id: 'services-lab',
    from: 'services',
    to: 'lab',
    module: 'soft-divider',
    variant: 'breath'
  },
  {
    id: 'lab-education',
    from: 'lab',
    to: 'education',
    module: 'soft-divider',
    variant: 'fine-rule'
  },
  {
    id: 'education-philosophy',
    from: 'education',
    to: 'philosophy',
    module: 'soft-divider',
    variant: 'breath'
  },
  {
    id: 'philosophy-contact',
    from: 'philosophy',
    to: 'contact',
    module: 'soft-divider',
    variant: 'fine-rule'
  }
];

export const executableTransitionModules = ['soft-divider'];
