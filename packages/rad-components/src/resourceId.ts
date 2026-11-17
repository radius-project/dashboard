import { parseResourceId as parseSharedResourceId } from '@radius-project/core/domain';

export interface ResourceId {
  plane: string;
  group: string;
  type: string;
  name: string;
}

export function parseResourceId(resourceId: unknown): ResourceId | undefined {
  if (typeof resourceId !== 'string') {
    return undefined;
  }
  const parsed = parseSharedResourceId(resourceId);
  if (
    parsed?.plane?.type.toLowerCase() !== 'radius' ||
    parsed.scopes.length !== 1 ||
    parsed.scopes[0].type.toLowerCase() !== 'resourcegroups' ||
    !parsed.resourceGroup ||
    parsed.segments.length !== 1
  ) {
    return undefined;
  }

  return {
    plane: parsed.plane.name,
    group: parsed.resourceGroup,
    type: parsed.type,
    name: parsed.name,
  };
}
