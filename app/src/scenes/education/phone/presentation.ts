const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function renderPhoneEducationProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number
): void {
  const progress = clamp(rawProgress);
  root?.style.setProperty('--r4-education-progress', progress.toFixed(4));
  root?.style.setProperty('--r4-education-opacity', progress.toFixed(4));
  root?.style.setProperty(
    '--r4-education-y',
    `${((1 - progress) * 28).toFixed(2)}px`
  );
  root?.setAttribute('data-education-progress', progress.toFixed(4));
}

export const renderPhoneEducationHold = (
  root: HTMLElement | null | undefined
) => renderPhoneEducationProgress(root, 1);
