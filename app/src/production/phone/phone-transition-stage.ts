import type { PhoneStageFrame } from './phone-stage-timeline';

type PhoneTransitionRenderer = Readonly<{
  render(progress: number): void;
}>;

export type PhoneStageTransitionRenderers = Readonly<{
  heroPattern: PhoneTransitionRenderer;
  patternStar: PhoneTransitionRenderer;
  starAod: PhoneTransitionRenderer;
}>;

/**
 * Adjacent ink adapters share scene endpoints. This function only renders
 * adapter frames; the snapshot projector alone assigns surface roles.
 */
export function renderPhoneStageTransitions(
  frame: PhoneStageFrame,
  transitions: PhoneStageTransitionRenderers
): void {
  const [
    ,
    ,
    ,
    ,
    ,
    ,
    heroPatternProgress,
    patternStarProgress,
    starAodProgress,
    ownershipKey
  ] = frame;
  if (ownershipKey === 'handoff-hero-pattern') {
    transitions.patternStar.render(patternStarProgress);
    transitions.starAod.render(starAodProgress);
    transitions.heroPattern.render(heroPatternProgress);
    return;
  }

  if (ownershipKey === 'handoff-pattern-star') {
    transitions.heroPattern.render(heroPatternProgress);
    transitions.starAod.render(starAodProgress);
    transitions.patternStar.render(patternStarProgress);
    return;
  }

  if (ownershipKey === 'handoff-star-aod') {
    transitions.heroPattern.render(heroPatternProgress);
    transitions.patternStar.render(patternStarProgress);
    transitions.starAod.render(starAodProgress);
    return;
  }

  transitions.heroPattern.render(heroPatternProgress);
  transitions.patternStar.render(patternStarProgress);
  transitions.starAod.render(starAodProgress);
}
