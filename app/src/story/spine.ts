import { storyManifest } from './manifest';
import type { SceneId, SegmentId, SpineHoldNode, SpineNode, SpineSegmentNode, StoryCursor, StoryManifest } from './types';

export type SpineLabel = `scene:${SceneId}` | `segment:${SegmentId}:start` | `segment:${SegmentId}:end`;

export type StorySpineSnapshot = {
  cursor: StoryCursor;
  virtualTime: number;
  virtualProgress: number;
};

export class StorySpine {
  readonly manifest: StoryManifest;

  private readonly labels = new Map<SpineLabel, number>();
  private readonly holdByScene = new Map<SceneId, SpineHoldNode>();
  private readonly segmentById = new Map<SegmentId, SpineSegmentNode>();
  private readonly holdIndexByScene = new Map<SceneId, number>();
  private readonly totalDuration: number;
  private activeCursor: StoryCursor;

  constructor(manifest: StoryManifest = storyManifest) {
    this.manifest = manifest;
    this.totalDuration = this.indexManifest(manifest.nodes);
    const firstHold = manifest.nodes[0];
    if (firstHold?.kind !== 'hold') {
      throw new Error('StorySpine requires a manifest that starts with a hold');
    }
    this.activeCursor = { status: 'hold', scene: firstHold.scene };
  }

  get cursor(): StoryCursor {
    return this.activeCursor;
  }

  get duration(): number {
    return this.totalDuration;
  }

  get virtualTime(): number {
    if (this.activeCursor.status === 'hold') {
      return this.labelOf(`scene:${this.activeCursor.scene}`);
    }
    if (this.activeCursor.status === 'settling') {
      return this.labelOf(`segment:${this.activeCursor.segment}:end`);
    }
    return this.labelOf(`segment:${this.activeCursor.segment}:start`);
  }

  get virtualProgress(): number {
    if (this.totalDuration === 0) {
      return 0;
    }
    return this.virtualTime / this.totalDuration;
  }

  labelOf(label: SpineLabel): number {
    const value = this.labels.get(label);
    if (value === undefined) {
      throw new Error(`Unknown spine label: ${label}`);
    }
    return value;
  }

  hold(scene: SceneId): SpineHoldNode {
    const node = this.holdByScene.get(scene);
    if (!node) {
      throw new Error(`Unknown hold scene: ${scene}`);
    }
    return node;
  }

  segment(segment: SegmentId): SpineSegmentNode {
    const node = this.segmentById.get(segment);
    if (!node) {
      throw new Error(`Unknown segment: ${segment}`);
    }
    return node;
  }

  nextSegment(scene: SceneId): SpineSegmentNode | null {
    const index = this.holdIndexByScene.get(scene);
    if (index === undefined) {
      return null;
    }
    const node = this.manifest.nodes[index + 1];
    return node?.kind === 'segment' ? node : null;
  }

  previousSegment(scene: SceneId): SpineSegmentNode | null {
    const index = this.holdIndexByScene.get(scene);
    if (index === undefined) {
      return null;
    }
    const node = this.manifest.nodes[index - 1];
    return node?.kind === 'segment' ? node : null;
  }

  segmentForDirection(scene: SceneId, direction: 1 | -1): SpineSegmentNode | null {
    return direction === 1 ? this.nextSegment(scene) : this.previousSegment(scene);
  }

  enterHold(scene: SceneId): StoryCursor {
    this.hold(scene);
    this.activeCursor = { status: 'hold', scene };
    return this.activeCursor;
  }

  enterSegment(segmentId: SegmentId): StoryCursor {
    const segment = this.segment(segmentId);
    this.activeCursor = {
      status: 'segment',
      segment: segment.id,
      from: segment.from,
      to: segment.to
    };
    return this.activeCursor;
  }

  enterSettling(segmentId: SegmentId, target: SceneId): StoryCursor {
    const segment = this.segment(segmentId);
    if (target !== segment.from && target !== segment.to) {
      throw new Error(`Settling target ${target} is not an endpoint for ${segmentId}`);
    }
    this.activeCursor = {
      status: 'settling',
      segment: segment.id,
      from: segment.from,
      to: segment.to,
      target
    };
    return this.activeCursor;
  }

  resolveLabel(label: string): StoryCursor {
    if (!label.startsWith('scene:')) {
      throw new Error(`Only scene labels can resolve to a hold cursor in R1: ${label}`);
    }
    const scene = label.slice('scene:'.length);
    return this.enterHold(scene as SceneId);
  }

  snapshot(): StorySpineSnapshot {
    return {
      cursor: this.cursor,
      virtualTime: this.virtualTime,
      virtualProgress: this.virtualProgress
    };
  }

  private indexManifest(nodes: readonly SpineNode[]): number {
    let virtualTime = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) {
        throw new Error(`Spine node ${index} is missing`);
      }

      if (node.kind === 'hold') {
        if (this.holdByScene.has(node.scene)) {
          throw new Error(`Duplicate hold scene in StorySpine: ${node.scene}`);
        }
        this.holdByScene.set(node.scene, node);
        this.holdIndexByScene.set(node.scene, index);
        this.labels.set(`scene:${node.scene}`, virtualTime);
        continue;
      }

      if (this.segmentById.has(node.id)) {
        throw new Error(`Duplicate segment in StorySpine: ${node.id}`);
      }
      this.segmentById.set(node.id, node);
      this.labels.set(`segment:${node.id}:start`, virtualTime);
      virtualTime += node.virtualDuration;
      this.labels.set(`segment:${node.id}:end`, virtualTime);
    }
    return virtualTime;
  }
}
