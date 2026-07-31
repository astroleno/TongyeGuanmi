export type SemanticBoolean = 'true' | 'false';

export const semanticBoolean = String as unknown as (
  value: boolean
) => SemanticBoolean;
