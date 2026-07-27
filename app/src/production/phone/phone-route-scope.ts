export type PhoneRouteScope = 'formal' | 'brand-lab';

/** The QA composition is deliberately addressable only by its pathname. */
export function phoneRouteScopeForPathname(pathname: string): PhoneRouteScope {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/brand-lab' ? 'brand-lab' : 'formal';
}
