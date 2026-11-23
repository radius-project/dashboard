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
} from './query';
import {
  connectionKey,
  RadiusConnection,
  RadiusConnections,
  RadiusConnectionStore,
} from './connections';

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
  readonly connections?: RadiusConnections;
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
  readonly connections: RadiusConnections;
  private defaultClient?: RadiusQueryClient;
  private readonly suppliedContext?: RadiusQueryContext;
  private controller = new AbortController();

  constructor(
    private readonly kubernetesApi: Pick<
      KubernetesApi,
      'getClusters' | 'proxy'
    >,
    context?: RadiusQueryContext,
    connections?: readonly RadiusConnection[],
  ) {
    if (context) {
      this.suppliedContext = {
        connectionId: context.connectionId,
        plane: { ...context.plane },
      };
    }
    const configured = connections?.map(c => ({
      connectionId: c.connectionId,
      plane: { ...c.plane },
    }));
    this.connections = new RadiusConnectionStore(
      async () => {
        if (this.suppliedContext) {
          return [this.suppliedContext];
        }
        const clusters = await this.kubernetesApi.getClusters();
        return configured
          ? configured.filter(c =>
              clusters.some(cluster => cluster.name === c.connectionId),
            )
          : clusters.map(cluster => ({
              connectionId: cluster.name,
              plane: { type: 'radius', name: 'local' },
            }));
      },
      (automaticSelection, error) => {
        if (!automaticSelection) {
          this.controller.abort(
            new Error(
              `The Radius connection changed. ${error?.message ?? 'Select a connection and reload the view.'}`,
            ),
          );
          this.controller = new AbortController();
        }
        this.defaultClient = undefined;
      },
    );
  }

  async getResourceById<T = Record<string, unknown>>(
    opts: { id: string } & QueryOptions,
  ): Promise<Resource<T>> {
    return this.run(
      (client, _context, signal) =>
        client.getResourceById<T>({ ...opts, signal }),
      opts,
    );
  }

  async listResources<T = Record<string, unknown>>(
    opts?: ResourceListOptions,
  ): Promise<RadiusListResult<T>> {
    return this.run(
      (client, _context, signal) =>
        client.listResources<T>({ ...opts, signal }),
      opts,
    );
  }

  async listApplications<T = ApplicationProperties>(
    opts?: Omit<ResourceListOptions, 'resourceType'>,
  ): Promise<RadiusListResult<T>> {
    return this.run(
      (client, _context, signal) =>
        client.listApplications<T>({ ...opts, signal }),
      opts,
    );
  }

  async listEnvironments<T = EnvironmentProperties>(
    opts?: Omit<ResourceListOptions, 'resourceType'>,
  ): Promise<RadiusListResult<T>> {
    return this.run(
      (client, _context, signal) =>
        client.listEnvironments<T>({ ...opts, signal }),
      opts,
    );
  }

  async listResourceTypes(opts?: {
    planeName?: string;
    resourceProviderName?: string;
    signal?: AbortSignal;
  }): Promise<ResourceList<ResourceTypeProperties>> {
    return this.run(
      (client, _context, signal) =>
        client.listResourceTypes({
          signal,
        }),
      opts,
    );
  }

  async getResourceType(opts: {
    namespace: string;
    typeName: string;
    planeName?: string;
    clusterName?: string;
    signal?: AbortSignal;
  }): Promise<ResourceType> {
    return this.run(
      (client, _context, signal) => client.getResourceType({ ...opts, signal }),
      opts,
    );
  }

  async getApplicationGraph(
    opts: { applicationId: string } & QueryOptions,
  ): Promise<RadiusApplicationGraph> {
    return this.run(
      async (client, context, signal) => ({
        graph: await client.getApplicationGraph({ ...opts, signal }),
        context: {
          ...context,
          plane: { ...context.plane },
          applicationId: opts.applicationId,
        },
      }),
      opts,
    );
  }

  private async resolveContext(): Promise<RadiusQueryContext> {
    await this.connections.refresh();
    const { selected, error } = this.connections.getSnapshot();
    if (error) throw error;
    if (!selected)
      throw new Error('Select a Radius connection before loading resources.');
    return selected;
  }

  private async run<T>(
    operation: (
      client: RadiusQueryClient,
      context: RadiusQueryContext,
      signal: AbortSignal,
    ) => Promise<T>,
    override?: {
      planeName?: string;
      clusterName?: string;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const previousSignal = this.controller.signal;
    override?.signal?.throwIfAborted();
    const preflightSignal = override?.signal
      ? AbortSignal.any([previousSignal, override.signal])
      : previousSignal;
    const context = override?.clusterName
      ? {
          connectionId: override.clusterName,
          plane: this.suppliedContext?.plane ?? {
            type: 'radius',
            name: 'local',
          },
        }
      : await this.abortable(this.resolveContext(), preflightSignal);
    previousSignal.throwIfAborted();
    if (
      !override?.clusterName &&
      connectionKey(context) !== this.connections.getSnapshot().selectionKey
    ) {
      throw new Error('The Radius connection changed. Reload this view.');
    }
    const sessionSignal = this.controller.signal;
    const signal = override?.signal
      ? AbortSignal.any([sessionSignal, override.signal])
      : sessionSignal;
    signal.throwIfAborted();
    const port = {
      request: <R>(request: RadiusQueryRequest) =>
        this.request<R>(request, sessionSignal),
    };
    let client: RadiusQueryClient;
    if (override?.planeName || override?.clusterName) {
      client = createRadiusQueryClient(port, {
        connectionId: override.clusterName || context.connectionId,
        plane: {
          ...context.plane,
          name: override.planeName || context.plane.name,
        },
      });
    } else {
      this.defaultClient ??= createRadiusQueryClient(port, context);
      client = this.defaultClient;
    }
    return this.abortable(operation(client, context, signal), signal);
  }

  private abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener('abort', abort);
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      work
        .then(value => {
          if (signal.aborted) reject(signal.reason);
          else resolve(value);
        }, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
  }

  private async request<T>(
    request: RadiusQueryRequest,
    sessionSignal: AbortSignal,
  ): Promise<T> {
    const signal = request.signal
      ? AbortSignal.any([sessionSignal, request.signal])
      : sessionSignal;
    signal.throwIfAborted();
    return this.abortable(this.send<T>(request, signal), signal);
  }

  private async send<T>(
    request: RadiusQueryRequest,
    signal: AbortSignal,
  ): Promise<T> {
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
        signal,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status}:\n\n${text}`);
    }
    return (await response.json()) as T;
  }
}
