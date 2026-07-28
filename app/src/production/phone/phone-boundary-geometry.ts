export type PhoneBoundaryGeometryOwner = readonly [
  sessionId: string,
  generation: number
];

export type PhoneBoundaryGeometryLease = Readonly<{
  owns(element: HTMLElement): boolean;
  releaseGeometry(): void;
}>;

type GeometryToken = object;

const geometryOwner = new WeakMap<HTMLElement, GeometryToken>();

export function acquirePhoneBoundaryGeometryLease(
  candidates: readonly (HTMLElement | null | undefined)[],
  owner: PhoneBoundaryGeometryOwner,
  clear: (element: HTMLElement) => void
): PhoneBoundaryGeometryLease {
  // The caller supplies an opaque execution owner at the lazy boundary. The
  // lease itself deliberately retains only a private token, so a stale chunk
  // cannot clear geometry acquired by a newer execution.
  void owner;
  const elements = [...new Set(candidates.filter(
    (element): element is HTMLElement => Boolean(element)
  ))];
  const token: GeometryToken = {};
  let active = true;

  for (const element of elements) geometryOwner.set(element, token);

  return {
    owns: (element) => active && geometryOwner.get(element) === token,
    releaseGeometry() {
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
