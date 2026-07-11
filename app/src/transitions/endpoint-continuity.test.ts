import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aodAnimationScene } from '../scenes/aod-animation';
import { contactScene } from '../scenes/contact';
import { heroScene } from '../scenes/hero';
import { methodTopScene } from '../scenes/method-top';
import { patternScene } from '../scenes/pattern';
import { starMapScene } from '../scenes/star-map';
import { figure2AnimationScene } from '../scenes/figure2-animation';
import { figure2ProofOpeningScene } from '../scenes/figure2-proof-opening';
import { figure2ProofCardsScene } from '../scenes/figure2-proof-cards';
import { figure2ProofClosingScene } from '../scenes/figure2-proof-closing';
import { brandScene } from '../scenes/brand';
import { figure3AnimationScene } from '../scenes/figure3-animation';
import { servicesScene } from '../scenes/services';
import { ttgAnimationScene } from '../scenes/ttg-animation';
import { labScene } from '../scenes/lab';
import { phAnimationScene } from '../scenes/ph-animation';
import { educationScene } from '../scenes/education';
import { craneAnimationScene } from '../scenes/crane-animation';
import type { SceneModule } from '../story/types';

const HOLD_SCENES: readonly SceneModule[] = [
  heroScene,
  patternScene,
  starMapScene,
  aodAnimationScene,
  methodTopScene,
  figure2AnimationScene,
  figure2ProofOpeningScene,
  figure2ProofCardsScene,
  figure2ProofClosingScene,
  brandScene,
  figure3AnimationScene,
  servicesScene,
  ttgAnimationScene,
  labScene,
  phAnimationScene,
  educationScene,
  craneAnimationScene,
  contactScene
];

const sceneTypesSource = readFileSync(new URL('../story/types.ts', import.meta.url), 'utf8');

describe('R4 transition endpoint continuity', () => {
  it.each(HOLD_SCENES.map((scene) => [scene.id, scene] as const))(
    '%s owns a canonical hold renderer',
    (_sceneId, scene) => {
      expect(scene.renderHold).toBeTypeOf('function');
    }
  );

  it('makes the canonical hold renderer mandatory in the Scene contract', () => {
    expect(sceneTypesSource).toContain('renderHold(layerRoot: HTMLElement | null): void;');
    expect(sceneTypesSource).not.toContain('renderHold?(layerRoot: HTMLElement | null): void;');
  });
});
