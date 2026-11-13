import { KubernetesApi } from '@backstage/plugin-kubernetes';
import type { GraphContext } from '@radius-project/core/graph';
import {
  createRadiusQueryClient,
  ApplicationGraphResponse,
  ApplicationProperties,
  EnvironmentProperties,
  QueryFailure,
  QueryOptions,
  RadiusQueryClient,
  RadiusQueryContext,
  RadiusQueryRequest,
  Resource,
  ResourceList,
  ResourceListOptions,
  ResourceType,
  ResourceTypeProperties,
} from '@radius-project/core/domain';

// Existing host overrides can still return the original { value } envelope.
export interface RadiusListResult<
  T = Record<string, unknown>,
> extends ResourceList<T> {
  readonly complete?: boolean;
  readonly errors?: readonly QueryFailure[];
}

export interface RadiusApplicationGraph {
  graph: ApplicationGraphResponse;
  context: GraphContext;
}

export interface RadiusApi {
  getResourceById<T = Record<string, unknown>>(
    opts: { id: string } & QueryOptions,
  ): Promise<Resource<T>>;
  listApplications<T = ApplicationProperties>(
    opts?: Omit<ResourceListOptions, 'resourceType'>,
  ): Promise<RadiusListResult<T>>;
  listEnvironments<T = EnvironmentProperties>(
    opts?: Omit<ResourceListOptions, 'resourceType'>,
  ): Promise<RadiusListResult<T>>;
  listResourceTypes(opts?: {
    planeName?: string;
    resourceProviderName?: string;
    signal?: AbortSignal;
  }): Promise<ResourceList<ResourceTypeProperties>>;
  getResourceType(opts: {
    namespace: string;
    typeName: string;
    planeName?: string;
    clusterName?: string;
    signal?: AbortSignal;
  }): Promise<ResourceType>;
  listResources<T = Record<string, unknown>>(
    opts?: ResourceListOptions,
  ): Promise<RadiusListResult<T>>;
  getApplicationGraph?(
    opts: { applicationId: string } & QueryOptions,
  ): Promise<RadiusApplicationGraph>;
}

export class RadiusApiImpl implements RadiusApi {
  private contextPromise?: Promise<RadiusQueryContext>;
  private defaultClient?: RadiusQueryClient;
  private readonly suppliedContext?: RadiusQueryContext;

  constructor(
    private readonly kubernetesApi: Pick<
      KubernetesApi,
      'getClusters' | 'proxy'
    >,
    context?: RadiusQueryContext,
  ) {
    if (context) {
      this.suppliedContext = {
        connectionId: context.connectionId,
        plane: { ...context.plane },
      };
    }
  }

  async getResourceById<T = Record<string, unknown>>(
    opts: { id: string } & QueryOptions,
  ): Promise<Resource<T>> {
    return (await this.client()).getResourceById<T>(opts);
  }

  async listResources<T = Record<string, unknown>>(
    opts?: ResourceListOptions,
  ): Promise<RadiusListResult<T>> {
    return (await this.client()).listResources<T>(opts);
  }

  async listApplications<T = ApplicationProperties>(
    opts?: Omit<ResourceListOptions, 'resourceType'>,
  ): Promise<RadiusListResult<T>> {
    return (await this.client()).listApplications<T>(opts);
  }

  async listEnvironments<T = EnvironmentProperties>(
    opts?: Omit<ResourceListOptions, 'resourceType'>,
  ): Promise<RadiusListResult<T>> {
    return (await this.client()).listEnvironments<T>(opts);
  }

  async listResourceTypes(opts?: {
    planeName?: string;
    resourceProviderName?: string;
    signal?: AbortSignal;
  }): Promise<ResourceList<ResourceTypeProperties>> {
    return (await this.client(opts)).listResourceTypes({
      signal: opts?.signal,
    });
  }

  async getResourceType(opts: {
    namespace: string;
    typeName: string;
    planeName?: string;
    clusterName?: string;
    signal?: AbortSignal;
  }): Promise<ResourceType> {
    return (await this.client(opts)).getResourceType(opts);
  }

  async getApplicationGraph(
    opts: { applicationId: string } & QueryOptions,
  ): Promise<RadiusApplicationGraph> {
    const context = await this.resolveContext();
    const graph = await (await this.client()).getApplicationGraph(opts);
    return {
      graph,
      context: {
        connectionId: context.connectionId,
        plane: { ...context.plane },
        applicationId: opts.applicationId,
      },
    };
  }

  private async resolveContext(): Promise<RadiusQueryContext> {
    if (this.suppliedContext) {
      return this.suppliedContext;
    }
    if (!this.contextPromise) {
      this.contextPromise = this.kubernetesApi.getClusters().then(clusters => {
        const first = clusters[0];
        if (!first) {
          throw new Error('No kubernetes clusters found');
        }
        return {
          connectionId: first.name,
          plane: { type: 'radius', name: 'local' },
        };
      });
    }
    const pending = this.contextPromise;
    try {
      return await pending;
    } catch (error) {
      if (this.contextPromise === pending) {
        this.contextPromise = undefined;
      }
      throw error;
    }
  }

  private async client(override?: {
    planeName?: string;
    clusterName?: string;
  }): Promise<RadiusQueryClient> {
    const context = override?.clusterName
      ? {
          connectionId: override.clusterName,
          plane: this.suppliedContext?.plane ?? {
            type: 'radius',
            name: 'local',
          },
        }
      : await this.resolveContext();
    const port = {
      request: <T>(request: RadiusQueryRequest) => this.request<T>(request),
    };
    if (override?.planeName || override?.clusterName) {
      return createRadiusQueryClient(port, {
        connectionId: override.clusterName || context.connectionId,
        plane: {
          ...context.plane,
          name: override.planeName || context.plane.name,
        },
      });
    }
    this.defaultClient ??= createRadiusQueryClient(port, context);
    return this.defaultClient;
  }

  private async request<T>(request: RadiusQueryRequest): Promise<T> {
    const response = await this.kubernetesApi.proxy({
      clusterName: request.connectionId,
      path: request.path,
      init: {
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'no-cache',
        method: request.method,
        ...(request.body !== undefined
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(request.body),
            }
          : {}),
        signal: request.signal,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status}:\n\n${text}`);
    }
    return (await response.json()) as T;
  }
}
