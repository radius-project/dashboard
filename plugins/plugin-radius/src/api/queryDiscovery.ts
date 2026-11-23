import {
  defaultApiVersion,
  object,
  QuerySession,
  segment,
} from './querySession';
import type {
  ResourceType,
  ResourceTypeProperties,
  ResourceList,
} from '../resources';

function versions(value: unknown): ResourceType['APIVersions'] {
  if (!object(value))
    throw new TypeError('Radius API versions must be an object.');
  const entries: Array<[string, { Schema?: unknown }]> = [];
  for (const [version, definition] of Object.entries(value)) {
    if (!version || !object(definition))
      throw new TypeError('Invalid Radius API version.');
    entries.push([version, definition]);
  }
  return Object.fromEntries(entries);
}

export function createDiscovery(session: QuerySession) {
  async function providers(signal?: AbortSignal) {
    const result = await session.request<{ value: unknown[] }>(
      `${session.planePath}/providers`,
      defaultApiVersion,
      signal,
    );
    if (!object(result) || !Array.isArray(result.value))
      throw new TypeError('Radius providers must contain a value array.');
    return result.value.map(provider => {
      if (
        !object(provider) ||
        typeof provider.name !== 'string' ||
        !object(provider.resourceTypes)
      ) {
        throw new TypeError('Invalid Radius provider.');
      }
      return { name: provider.name, resourceTypes: provider.resourceTypes };
    });
  }

  async function getResourceType(options: {
    namespace: string;
    typeName: string;
    signal?: AbortSignal;
  }): Promise<ResourceType> {
    const { namespace, typeName, signal } = options;
    const path = `${session.planePath}/providers/${segment(namespace)}/resourceTypes/${segment(typeName)}`;
    try {
      const response = await session.request<unknown>(
        path,
        defaultApiVersion,
        signal,
      );
      if (!object(response))
        throw new TypeError('Invalid Radius resource type.');
      const apiVersions = versions(response.APIVersions);
      if (
        !Array.isArray(response.APIVersionList) ||
        !response.APIVersionList.every(version => typeof version === 'string')
      ) {
        throw new TypeError(
          'Radius API version list must be an array of strings.',
        );
      }
      return {
        Name: typeof response.Name === 'string' ? response.Name : typeName,
        Description:
          typeof response.Description === 'string'
            ? response.Description
            : 'No description available for this resource type.',
        ResourceProviderNamespace: namespace,
        APIVersions: apiVersions,
        APIVersionList: response.APIVersionList,
      };
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      const provider = (await providers(signal)).find(
        item => item.name === namespace,
      );
      const definition = provider?.resourceTypes[typeName];
      if (!object(definition))
        throw new Error(`Resource type ${namespace}/${typeName} not found`, {
          cause: error,
        });
      const apiVersions = versions(definition.apiVersions ?? {});
      return {
        Name: `${namespace}/${typeName}`,
        Description:
          typeof definition.description === 'string'
            ? definition.description
            : `This is the ${typeName} resource type from the ${namespace} provider. It allows you to define and manage ${typeName} resources within your Radius applications.`,
        ResourceProviderNamespace: namespace,
        APIVersions: apiVersions,
        APIVersionList: Object.keys(apiVersions),
      };
    }
  }

  async function bestVersion(
    type: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const [namespace, typeName, ...nested] = type.split('/');
    // These calls validate the segments; request builders encode them later.
    segment(namespace);
    segment(typeName);
    if (nested.length)
      throw new TypeError(
        'Radius query resourceType must have a namespace and one type.',
      );
    try {
      return (
        (await getResourceType({ namespace, typeName, signal }))
          .APIVersionList[0] || defaultApiVersion
      );
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      // Older control planes do not expose discovery for every served type.
      return defaultApiVersion;
    }
  }

  async function listResourceTypes(
    options: { signal?: AbortSignal } = {},
  ): Promise<ResourceList<ResourceTypeProperties>> {
    const value: ResourceList<ResourceTypeProperties>['value'] = [];
    for (const provider of await providers(options.signal)) {
      for (const [type, definition] of Object.entries(provider.resourceTypes)) {
        if (!object(definition))
          throw new TypeError('Invalid Radius resource type.');
        const apiVersions = Object.keys(versions(definition.apiVersions ?? {}));
        if (!apiVersions.length) continue;
        const fullName = `${provider.name}/${type}`;
        value.push({
          id: fullName,
          name: fullName,
          type: 'System.Resources/resourceTypes',
          systemData: {},
          properties: {
            namespace: provider.name,
            type,
            apiVersions,
            apiVersion: apiVersions.join('\n'),
          },
        });
      }
    }
    return { value };
  }
  return { getResourceType, bestVersion, listResourceTypes };
}
