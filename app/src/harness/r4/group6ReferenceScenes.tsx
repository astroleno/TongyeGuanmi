import type { SceneComponentProps, SceneModule } from '../../story/types';

const LAB_REFERENCE_COPY = [
  '同样一件事，有人报三万有人报三千万。我们帮你看真生意里的 AI——投流怎么花、店怎么卖、车间怎么排。',
  '落到现场',
  '先看账，',
  '再定工具。'
] as const;

function renderLabReferenceProgress(root: HTMLElement | null | undefined, progress: number): void {
  const clamped = Math.min(1, Math.max(0, progress));
  root?.style.setProperty('--r4-lab-ref-progress', clamped.toFixed(4));
  root?.style.setProperty('--r4-lab-ref-opacity', clamped.toFixed(4));
  root?.style.setProperty('--r4-lab-ref-y', `${((1 - clamped) * 28).toFixed(2)}px`);
  root?.setAttribute('data-lab-progress', clamped.toFixed(4));
}

function LabReferenceScene({ registerHandle }: SceneComponentProps) {
  return (
    <article
      ref={(element) => {
        registerHandle?.('copy', element);
        renderLabReferenceProgress(element, 1);
      }}
      className="r4-lab-ref"
      data-r4-scene="lab"
      data-r4-reference-scene="true"
    >
      <div className="r4-lab-ref__copy">
        <h2>{LAB_REFERENCE_COPY[0]}</h2>
        <p>{LAB_REFERENCE_COPY[1]}</p>
        <h3>
          <span>{LAB_REFERENCE_COPY[2]}</span>
          <span>{LAB_REFERENCE_COPY[3]}</span>
        </h3>
      </div>
    </article>
  );
}

export const labReferenceScene: SceneModule = {
  id: 'lab',
  Component: LabReferenceScene,
  renderHold: (root) => renderLabReferenceProgress(root, 1),
  requiredHandles: ['copy'],
  preload: () => ({ milestones: ['targetReady'] })
};
