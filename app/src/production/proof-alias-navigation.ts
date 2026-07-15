import { positionReadingAtEdge, readingScrollport } from '../stage/reading';
import type { Figure2ProofPanel, SceneId } from '../story/types';
import { figure2ProofPanelFromHash } from './navigation';

export type ProofAliasPosition = Readonly<{
  panel: Figure2ProofPanel;
  edge?: 'top' | 'bottom';
}>;

export function positionProofAlias(
  layer: HTMLElement | null,
  panel: Figure2ProofPanel
): 'top' | 'bottom' | undefined {
  if (panel === 'opening') {
    positionReadingAtEdge(layer, 'top');
    return 'top';
  }
  if (panel === 'closing') {
    positionReadingAtEdge(layer, 'bottom');
    return 'bottom';
  }
  const scrollport = readingScrollport(layer);
  if (!scrollport) {
    return undefined;
  }
  const cards = layer?.querySelector<HTMLElement>('[data-r4-proof-panel="cards"]');
  scrollport.scrollTop = cards?.offsetTop ?? scrollport.clientHeight;
  delete scrollport.dataset.readingEdge;
  return undefined;
}

export function positionCurrentProofHistoryAlias(
  layer: HTMLElement | null,
  currentScene: SceneId,
  hash: string
): ProofAliasPosition | undefined {
  if (currentScene !== 'figure2-proof' || !readingScrollport(layer)) {
    return undefined;
  }
  const panel = figure2ProofPanelFromHash(hash);
  if (!panel) {
    return undefined;
  }
  const edge = positionProofAlias(layer, panel);
  return edge ? { panel, edge } : { panel };
}
