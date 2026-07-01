export const homepageAliases = {
  home: {
    legacyHash: '#home',
    mapsToScene: 'hero',
    reason: 'home hash maps to the opening scene'
  },
  top: {
    legacyHash: '#top',
    mapsToScene: 'hero',
    reason: 'top anchor maps to the opening scene'
  },
  method: {
    legacyHash: '#method',
    mapsToScene: 'method-top',
    reason: 'method hash enters the stable method reading scene'
  },
  brand: {
    legacyHash: '#brand',
    mapsToScene: 'brand',
    reason: 'brand remains a stable reading scene'
  },
  services: {
    legacyHash: '#services',
    mapsToScene: 'services',
    reason: 'services remains a stable reading scene'
  },
  lab: {
    legacyHash: '#lab',
    mapsToScene: 'lab',
    reason: 'lab remains a stable reading scene'
  },
  education: {
    legacyHash: '#education',
    mapsToScene: 'education',
    reason: 'education remains a stable reading scene'
  },
  philosophy: {
    legacyHash: '#philosophy',
    mapsToScene: 'education',
    reason: 'philosophy removed from SceneRuntime v1 timeline'
  },
  contact: {
    legacyHash: '#contact',
    mapsToScene: 'contact',
    reason: 'contact remains the terminal reading scene'
  }
};

export const homepagePublicHashTargets = Object.fromEntries(
  Object.values(homepageAliases).map((alias) => [alias.legacyHash, alias.mapsToScene])
);
