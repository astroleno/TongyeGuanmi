export type MountSelfFadeFixture = {
  rejectedPattern: string;
  acceptedPattern: string;
  r0Disposition: 'checklist-only';
};

export const mountSelfFadeFixture: MountSelfFadeFixture = {
  rejectedPattern: 'A scene mount effect changes its own root opacity, visibility, transform, or pointer interactivity.',
  acceptedPattern: 'A scene mounts hidden and waits for the transition timeline to control visibility.',
  r0Disposition: 'checklist-only'
};
