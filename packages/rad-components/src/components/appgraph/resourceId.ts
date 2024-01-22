const RESOURCE_ID_REGEX =
  /^\/planes\/radius\/(?<plane>[0-9a-zA-Z-]+)\/resourceGroups\/(?<group>[0-9a-zA-Z-]+)\/providers\/(?<namespace>[a-zA-Z\\.]+)\/(?<type>[a-zA-Z]+)\/(?<name>[0-9a-zA-Z-]+)$/i;

export interface ResourceId {
  plane: string;
  group: string;
  type: string;
  name: string;
}

export function parseResourceId(resourceId: string): ResourceId | undefined {
  const match = RESOURCE_ID_REGEX.exec(resourceId);
  if (!match) {
    return undefined;
  }

  const { plane, group, namespace, type, name } = match.groups ?? {};
  return { plane, group, type: `${namespace}/${type}`, name };
}
