import { graphContextKey } from '@radius-project/core/graph';
import type { GraphResource } from '@radius-project/core/graph';
import { createDiscovery } from './queryDiscovery';
import {
  defaultApiVersion,
  object,
  QuerySession,
  segment,
} from './querySession';
import { getEquivalentTypes } from '../resources';
import type {
  ApplicationProperties,
  EnvironmentProperties,
  Resource,
  ResourceList,
} from '../resources';
import type {
  QueryFailure,
  QueryOptions,
  QueryResult,
  RadiusQueryContext,
  RadiusQueryPort,
  ResourceListOptions,
} from './queryContracts';

export interface ApplicationGraphResponse {
  name?: string;
  resources: Array<GraphResource & { iconHash?: string | null }>;
  icons?: Record<string, string | null>;
}

function list<T>(value: ResourceList<T>): Resource<T>[] {
  if (!object(value) || !Array.isArray(value.value)) {
    throw new TypeError('Radius resource list must contain a value array.');
  }
  for (const resource of value.value) validateResource(resource);
  return value.value;
}

function validateResource<T>(value: Resource<T>): void {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.type !== 'string' ||
    !object(value.properties)
  ) {
    throw new TypeError('Invalid Radius resource.');
  }
}

export function createRadiusQueryClient(
  port: RadiusQueryPort,
  context: RadiusQueryContext,
  options: { concurrency?: number } = {},
) {
  const session = new QuerySession(port, context, options.concurrency ?? 4);
  const discovery = createDiscovery(session);

  async function getRaw<T>(
    id: string,
    signal?: AbortSignal,
  ): Promise<Resource<T>> {
    const identity = session.resource(id);
    const version = await discovery.bestVersion(identity.type, signal);
    const resource = await session.request<Resource<T>>(id, version, signal);
    validateResource(resource);
    session.resource(resource.id);
    if (resource.id.toLowerCase() !== id.toLowerCase()) {
      throw new TypeError(
        'Radius resource response does not match the requested ID.',
      );
    }
    return resource;
  }

  async function getResourceById<T = Record<string, unknown>>(
    input: { id: string } & QueryOptions,
  ): Promise<Resource<T>> {
    const resource = await getRaw<T>(input.id, input.signal);
    const properties = resource.properties;
    if (
      object(properties) &&
      typeof properties.application === 'string' &&
      !properties.environment
    ) {
      const application = await getRaw<ApplicationProperties>(
        properties.application,
        input.signal,
      );
      if (typeof application.properties.environment !== 'string') {
        throw new TypeError('Radius application environment must be a string.');
      }
      return {
        ...resource,
        properties: {
          ...properties,
          environment: application.properties.environment,
        },
      };
    }
    return resource;
  }

  async function merge<T extends { id: string }>(
    jobs: Array<{
      resourceType?: string;
      resourceId?: string;
      run: () => Promise<T[]>;
    }>,
    signal?: AbortSignal,
  ): Promise<{ value: T[]; complete: boolean; errors: QueryFailure[] }> {
    signal?.throwIfAborted();
    const results = await Promise.allSettled(jobs.map(job => job.run()));
    signal?.throwIfAborted();
    const value: T[] = [];
    const errors: QueryFailure[] = [];
    const seen = new Set<string>();
    let successes = 0;
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        if (
          result.reason instanceof Error &&
          result.reason.name === 'AbortError'
        )
          throw result.reason;
        const { resourceType, resourceId } = jobs[index];
        errors.push({ resourceType, resourceId, error: result.reason });
        continue;
      }
      successes++;
      for (const resource of result.value) {
        if (seen.has(resource.id)) continue;
        seen.add(resource.id);
        value.push(resource);
      }
    }
    if (jobs.length && !successes) throw errors[0].error;
    return { value, complete: errors.length === 0, errors };
  }

  async function listTyped<T>(
    input: ResourceListOptions,
    type: string,
  ): Promise<Resource<T>[]> {
    const version = await discovery.bestVersion(type, input.signal);
    const group =
      input.resourceGroup === undefined
        ? ''
        : `/resourceGroups/${segment(input.resourceGroup)}`;
    const resources = list(
      await session.request<ResourceList<T>>(
        `${session.planePath}${group}/providers/${type.split('/').map(segment).join('/')}`,
        version,
        input.signal,
      ),
    );
    for (const resource of resources) session.resource(resource.id);
    return resources;
  }

  async function listResources<T = Record<string, unknown>>(
    input: ResourceListOptions = {},
  ): Promise<QueryResult<T>> {
    if (input.resourceGroup !== undefined) segment(input.resourceGroup);
    if (input.resourceType !== undefined) {
      const types = getEquivalentTypes(input.resourceType) ?? [
        input.resourceType,
      ];
      return merge(
        types.map(resourceType => ({
          resourceType,
          run: () => listTyped<T>(input, resourceType),
        })),
        input.signal,
      );
    }
    const groups =
      input.resourceGroup === undefined
        ? await session.request<{ value: Array<{ name: string }> }>(
            `${session.planePath}/resourceGroups`,
            defaultApiVersion,
            input.signal,
          )
        : { value: [{ name: input.resourceGroup }] };
    if (!object(groups) || !Array.isArray(groups.value))
      throw new TypeError('Radius resource groups must contain a value array.');
    const groupJobs = groups.value.map(group => {
      if (!object(group) || typeof group.name !== 'string')
        throw new TypeError('Invalid Radius resource group.');
      const path = `${session.planePath}/resourceGroups/${segment(group.name)}/resources`;
      return {
        resourceId: path,
        run: async () => {
          const response = await session.request<{
            value: Array<{ id: string; type: string }>;
          }>(path, defaultApiVersion, input.signal);
          if (
            !object(response) ||
            !Array.isArray(response.value) ||
            !response.value.every(
              resource =>
                object(resource) &&
                typeof resource.id === 'string' &&
                typeof resource.type === 'string',
            )
          ) {
            throw new TypeError(
              'Radius inventory must contain resource IDs and types.',
            );
          }
          return response.value;
        },
      };
    });
    const inventory = await merge(groupJobs, input.signal);
    const hydrated = await merge(
      inventory.value
        .filter(
          resource =>
            resource.type.toLowerCase() !== 'microsoft.resources/deployments',
        )
        .map(resource => ({
          resourceId: resource.id,
          run: async () => [
            await getResourceById<T>({ id: resource.id, signal: input.signal }),
          ],
        })),
      input.signal,
    );
    const errors = [...inventory.errors, ...hydrated.errors];
    return { value: hydrated.value, errors, complete: errors.length === 0 };
  }

  function listApplications<T = ApplicationProperties>(
    input: Omit<ResourceListOptions, 'resourceType'> = {},
  ) {
    return listResources<T>({
      ...input,
      resourceType: 'Applications.Core/applications',
    });
  }

  function listEnvironments<T = EnvironmentProperties>(
    input: Omit<ResourceListOptions, 'resourceType'> = {},
  ) {
    return listResources<T>({
      ...input,
      resourceType: 'Applications.Core/environments',
    });
  }

  async function getApplicationGraph(
    input: { applicationId: string } & QueryOptions,
  ): Promise<ApplicationGraphResponse> {
    graphContextKey({ ...session.context, applicationId: input.applicationId });
    const type = session.resource(input.applicationId).type;
    const version = await discovery.bestVersion(type, input.signal);
    // includeIcons was added to the Radius.Core 2025-08-01 graph action.
    const includeIcons =
      type.toLowerCase() === 'radius.core/applications' &&
      /^\d{4}-\d{2}-\d{2}(?:-preview)?$/.test(version) &&
      version.slice(0, 10) >= '2025-08-01';
    const graph = await session.request<ApplicationGraphResponse>(
      `${input.applicationId}/getGraph`,
      version,
      input.signal,
      'POST',
      includeIcons ? { includeIcons: true } : undefined,
    );
    if (!object(graph) || !Array.isArray(graph.resources))
      throw new TypeError('Radius graph resources must be an array.');
    return graph;
  }

  return {
    getResourceById,
    listResources,
    listApplications,
    listEnvironments,
    getResourceType: discovery.getResourceType,
    listResourceTypes: discovery.listResourceTypes,
    getApplicationGraph,
  };
}

export type RadiusQueryClient = ReturnType<typeof createRadiusQueryClient>;

export type {
  ApplicationProperties,
  EnvironmentProperties,
  Resource,
  ResourceList,
  ResourceType,
  ResourceTypeProperties,
} from '../resources';
export type {
  QueryFailure,
  QueryOptions,
  RadiusQueryContext,
  RadiusQueryRequest,
  ResourceListOptions,
} from './queryContracts';
