export const homepageTransitionRegistry = {
  aod: () => import('./homepage/aod-homepage-adapter.js'),
  figure2: () => import('./homepage/figure2-homepage-adapter.js'),
  'pattern-bloom': () => import('./pattern-bloom-adapter.js'),
  ttg: () => import('./homepage/ttg-homepage-adapter.js'),
  'figure3-transition': () => import('./homepage/figure3-homepage-adapter.js'),
  ph: () => import('./homepage/ph-homepage-adapter.js'),
  crane: () => import('./homepage/crane-homepage-adapter.js')
};
