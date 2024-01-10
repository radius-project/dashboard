import { KubernetesApi } from '@backstage/plugin-kubernetes';
import {
  ApplicationProperties,
  EnvironmentProperties,
  Resource,
  ResourceList,
} from '../resources';

export interface RadiusApi {
  getResourceById<T = { [key: string]: unknown }>(opts: {
    id: string;
  }): Promise<Resource<T>>;
  listApplications<T = ApplicationProperties>(opts?: {
    resourceGroup?: string;
  }): Promise<ResourceList<T>>;
  listEnvironments<T = EnvironmentProperties>(opts?: {
    resourceGroup?: string;
  }): Promise<ResourceList<T>>;

  listResources<T = { [key: string]: unknown }>(opts?: {
    resourceType?: string;
    resourceGroup?: string;
  }): Promise<ResourceList<T>>;
}

const pathPrefix = '/apis/api.ucp.dev/v1alpha3';
const apiVersion = '?api-version=2023-10-01-preview';

export const makePathForId = (id: string) => {
  return `${pathPrefix}${id}${apiVersion}`;
};

export const makePath = ({
  scopes,
  type,
  name,
  action,
}: {
  scopes: { type: string; value?: string }[];
  type?: string;
  name?: string;
  action?: string;
}) => {
  const scopePart = scopes
    .map(s => {
      if (s.value) {
        return `${s.type}/${s.value}`;
      }

      return s.type;
    })
    .join('/');
  const typePart = type ? `/providers/${type}` : '';
  const namePart = name ? `/${name}` : '';
  const actionPart = action ? `/${action}` : '';
  const id = `/planes/${scopePart}${typePart}${namePart}${actionPart}`;
  return makePathForId(id);
};

export class RadiusApiImpl implements RadiusApi {
  constructor(
    private readonly kubernetesApi: Pick<
      KubernetesApi,
      'getClusters' | 'proxy'
    >,
  ) {}

  async listResources<T = { [key: string]: unknown }>(
    opts?: { resourceType?: string; resourceGroup?: string } | undefined,
  ): Promise<ResourceList<T>> {
    const cluster = await this.selectCluster();

    // Fast path for listing resources of a specific type.
    if (opts?.resourceType) {
      const path = makePath({
        scopes: this.makeScopes(opts),
        type: opts.resourceType,
      });
      return this.makeRequest<ResourceList<T>>(cluster, path);
    }

    // no way to list resources in all groups yet :-/. Let's do the O(n) thing for now.
    const groups = await this.makeRequest<ResourceList<Record<string, never>>>(
      cluster,
      makePath({
        scopes: [
          { type: 'radius', value: 'local' },
          {
            type: 'resourceGroups',
          },
        ],
      }),
    );
    const resources: Resource<T>[] = [];
    for (const group of groups.value) {
      // Unfortunately we don't include all of the relevant properties in tracked resources.
      // This is inefficient, but we'll have to do it for now.
      const path = makePath({
        scopes: [
          { type: 'radius', value: 'local' },
          {
            type: 'resourceGroups',
            value: group.name,
          },
        ],
        action: 'resources',
      });
      const groupResources = await this.makeRequest<
        ResourceList<Record<string, never>>
      >(cluster, path);
      if (groupResources.value) {
        for (const resource of groupResources.value) {
          // Deployments show up in tracked resources, but the RP may not hold onto them.
          // There's limited value here so skip them for now.
          if (resource.type === 'Microsoft.Resources/deployments') {
            continue;
          }
          resources.push(await this.getResourceById<T>({ id: resource.id }));
        }
      }
    }
    return { value: resources };
  }

  async getResourceById<T = { [key: string]: unknown }>(opts: {
    id: string;
  }): Promise<Resource<T>> {
    const cluster = await this.selectCluster();

    const path = makePathForId(opts.id);
    const resource = await this.makeRequest<Resource<T>>(cluster, path);
    return await this.fixupResource(resource);
  }

  async listApplications<T = ApplicationProperties>(opts?: {
    resourceGroup?: string;
  }): Promise<ResourceList<T>> {
    const cluster = await this.selectCluster();

    const path = makePath({
      scopes: this.makeScopes(opts),
      type: 'Applications.Core/applications',
    });
    return this.makeRequest<ResourceList<T>>(cluster, path);
  }

  async listEnvironments<T = EnvironmentProperties>(opts?: {
    resourceGroup?: string;
  }): Promise<ResourceList<T>> {
    const cluster = await this.selectCluster();

    const path = makePath({
      scopes: this.makeScopes(opts),
      type: 'Applications.Core/environments',
    });
    return this.makeRequest<ResourceList<T>>(cluster, path);
  }

  private async selectCluster(): Promise<string> {
    const clusters = await this.kubernetesApi.getClusters();
    for (const cluster of clusters) {
      return cluster.name;
    }

    throw new Error('No kubernetes clusters found');
  }

  private makeScopes(opts?: {
    resourceGroup?: string;
  }): { type: string; value?: string }[] {
    const scopes = [{ type: 'radius', value: 'local' }];
    if (opts?.resourceGroup) {
      scopes.push({ type: 'resourceGroups', value: opts.resourceGroup });
    }
    return scopes;
  }

  private async makeRequest<T>(cluster: string, path: string): Promise<T> {
    const response = await this.kubernetesApi.proxy({
      clusterName: cluster,
      path: path,
      init: {
        referrerPolicy: 'no-referrer', // See https://github.com/radius-project/radius/issues/6983
        mode: 'cors',
        cache: 'no-cache',
        method: 'GET',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status}:\n\n${text}`);
    }

    const data = (await response.json()) as T;
    return data;
  }

  private async fixupResource<T>(resource: Resource<T>): Promise<Resource<T>> {
    const p = resource.properties as { [key: string]: string };
    if (p.application && !p.environment) {
      const app = await this.getResourceById<ApplicationProperties>({
        id: p.application,
      });
      p.environment = app.properties.environment;
    }

    resource.properties = p as T;
    return resource;
  }
}
