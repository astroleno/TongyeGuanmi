export type SemanticBoolean = 'true' | 'false';

export function semanticBoolean(value: boolean): SemanticBoolean {
  return value ? 'true' : 'false';
}
