export type PhoneBoundaryGeometryOwner = Readonly<{
  sessionId: string;
  generation: number;
}>;

export type PhoneBoundaryGeometryLease = PhoneBoundaryGeometryOwner & Readonly<{
  owns(element: HTMLElement): boolean;
  release(): void;
}>;

type GeometryToken = object;

const geometryOwner = new WeakMap<HTMLElement, GeometryToken>();

export function acquirePhoneBoundaryGeometryLease(
  candidates: readonly (HTMLElement | null | undefined)[],
  owner: PhoneBoundaryGeometryOwner,
  clear: (element: HTMLElement) => void
): PhoneBoundaryGeometryLease {
  const elements = [...new Set(candidates.filter(
    (element): element is HTMLElement => Boolean(element)
  ))];
  const token: GeometryToken = {};
  let active = true;

  for (const element of elements) geometryOwner.set(element, token);

  return {
    ...owner,
    owns: (element) => active && geometryOwner.get(element) === token,
    release() {
      if (!active) return;
      active = false;
      for (const element of elements) {
        if (geometryOwner.get(element) !== token) continue;
        geometryOwner.delete(element);
        clear(element);
      }
    }
  };
}
