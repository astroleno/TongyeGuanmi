export type PhoneEdgeScene =
  | 'hero'
  | 'pattern'
  | 'star'
  | 'aod'
  | 'method'
  | 'figure2'
  | 'proof'
  | 'brand'
  | 'figure3'
  | 'services'
  | 'ttg'
  | 'lab';

export type PhoneEdgeSurfaceProfile =
  | 'baseline'
  | 'pattern-terminal';

export const PHONE_PATTERN_TERMINAL_EDGE_SURFACE = '#8f7f61';

export const PHONE_EDGE_SURFACE_BY_SCENE: Readonly<
  Record<PhoneEdgeScene, string>
> = {
  hero: '#07110e',
  pattern: PHONE_PATTERN_TERMINAL_EDGE_SURFACE,
  star: '#06100d',
  aod: '#ede4d2',
  method: '#ede4d2',
  figure2: '#e2dac9',
  proof: '#ede4d2',
  brand: '#ede4d2',
  figure3: '#ede4d2',
  services: '#ede4d2',
  ttg: '#080d10',
  lab: '#ede4d2'
};

export function phoneEdgeSurfaceForScene(
  scene: PhoneEdgeScene,
  profile: PhoneEdgeSurfaceProfile = 'baseline'
): string {
  if (profile === 'pattern-terminal' && scene === 'pattern') {
    return PHONE_PATTERN_TERMINAL_EDGE_SURFACE;
  }
  return PHONE_EDGE_SURFACE_BY_SCENE[scene];
}
