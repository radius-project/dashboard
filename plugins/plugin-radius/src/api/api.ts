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

  // List available resource types from System.Resources provider for a given plane and provider
  listResourceTypes(opts?: {
    planeName?: string;
    resourceProviderName?: string;
  }): Promise<
    ResourceList<{
      namespace: string;
      type: string;
      apiVersion: string;
      apiVersions?: string[];
    }>
  >;

  getResourceType(opts: {
    namespace: string;
    typeName: string;
    planeName?: string;
  }): Promise<{
    Name: string;
    Description: string;
    ResourceProviderNamespace: string;
    APIVersions: Record<string, { Schema?: unknown }>;
    APIVersionList: string[];
  }>;

  // Learn a resource type schema from a Terraform module in a Git repository
  learnResourceType(opts: {
    gitUrl: string;
    namespace?: string;
    typeName?: string;
    planeName?: string;
  }): Promise<{
    namespace: string;
    typeName: string;
    yaml: string;
    variableCount: number;
    generatedTypeName: boolean;
    inferredNamespace: boolean;
  }>;

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

  async getResourceType(opts: {
    namespace: string;
    typeName: string;
    planeName?: string;
  }): Promise<{
    Name: string;
    Description: string;
    ResourceProviderNamespace: string;
    APIVersions: Record<string, { Schema?: unknown }>;
    APIVersionList: string[];
  }> {
    const cluster = await this.selectCluster();
    const plane = opts?.planeName || 'local';

    // Try to get specific resource type details from UCP API
    // This endpoint should match what 'rad resource-type show' calls
    const specificPath = makePath({
      scopes: [{ type: 'radius', value: plane }],
      action: `providers/${opts.namespace}/resourceTypes/${opts.typeName}`,
    });

    try {
      // Try the specific resource type endpoint first
      const specificData = await this.makeRequest<{
        Name: string;
        Description?: string;
        ResourceProviderNamespace: string;
        APIVersions: Record<string, { Schema?: unknown }>;
        APIVersionList: string[];
      }>(cluster, specificPath);

      return {
        Name: specificData.Name,
        Description:
          specificData.Description ||
          'No description available for this resource type.',
        ResourceProviderNamespace: specificData.ResourceProviderNamespace,
        APIVersions: specificData.APIVersions,
        APIVersionList: specificData.APIVersionList,
      };
    } catch (error) {
      // Fallback to the providers endpoint if specific endpoint fails
      const providersPath = makePath({
        scopes: [{ type: 'radius', value: plane }],
        action: 'providers',
      });

      const data = await this.makeRequest<{ [key: string]: unknown }>(
        cluster,
        providersPath,
      );
      const providers =
        (
          data as {
            value?: Array<{
              name: string;
              resourceTypes: Record<
                string,
                {
                  apiVersions: Record<string, unknown>;
                  description?: string;
                }
              >;
            }>;
          }
        ).value || [];

      // Find the specific resource type in providers list
      for (const provider of providers) {
        if (provider.name === opts.namespace) {
          const resourceTypes = provider.resourceTypes || {};
          const resourceType = resourceTypes[opts.typeName];

          if (resourceType) {
            const apiVersions = Object.keys(resourceType.apiVersions || {});

            return {
              Name: `${opts.namespace}/${opts.typeName}`,
              Description:
                resourceType.description ||
                `This is the ${opts.typeName} resource type from the ${opts.namespace} provider. It allows you to define and manage ${opts.typeName} resources within your Radius applications.`,
              ResourceProviderNamespace: opts.namespace,
              APIVersions: resourceType.apiVersions as Record<
                string,
                { Schema?: unknown }
              >,
              APIVersionList: apiVersions,
            };
          }
        }
      }

      throw new Error(
        `Resource type ${opts.namespace}/${opts.typeName} not found`,
      );
    }
  }

  async listResourceTypes(opts?: {
    planeName?: string;
    resourceProviderName?: string;
  }): Promise<
    ResourceList<{
      namespace: string;
      type: string;
      apiVersion: string;
      apiVersions?: string[];
    }>
  > {
    const cluster = await this.selectCluster();

    const plane = opts?.planeName || 'local';

    // Use the ListResourceProviderSummaries endpoint: /planes/radius/{planeName}/providers
    const path = makePath({
      scopes: [{ type: 'radius', value: plane }],
      action: 'providers',
    });

    // Get the resource provider summaries
    const data = await this.makeRequest<{ [key: string]: unknown }>(
      cluster,
      path,
    );

    const items: Array<{
      id: string;
      name: string;
      type: string;
      systemData: Record<string, never>;
      properties: {
        namespace: string;
        type: string;
        apiVersion: string;
        apiVersions?: string[];
      };
    }> = [];

    // Parse the providers response structure
    const providers =
      (
        data as {
          value?: Array<{
            name: string;
            resourceTypes: Record<
              string,
              {
                apiVersions: Record<string, unknown>;
              }
            >;
          }>;
        }
      ).value || [];

    // Extract resource types from each provider, filtering for Radius namespaces
    for (const provider of providers) {
      const namespace = provider.name;
      const resourceTypes = provider.resourceTypes || {};

      // Include all namespaces - filtering will be done on the frontend
      // This includes Applications.*, Microsoft.Resources, etc.

      for (const [typeName, typeInfo] of Object.entries(resourceTypes)) {
        const apiVersions = Object.keys(typeInfo.apiVersions || {});
        const fullName = `${namespace}/${typeName}`;

        // Create a single entry with all API versions
        if (apiVersions.length > 0) {
          items.push({
            id: fullName,
            name: fullName,
            type: 'System.Resources/resourceTypes',
            systemData: {},
            properties: {
              namespace,
              type: typeName, // Show only the type name without namespace
              apiVersions: apiVersions, // Store all API versions
              apiVersion: apiVersions.join('\n'), // Display versions separated by newlines
            },
          });
        }
      }
    }

    return { value: items };
  }

  async learnResourceType(opts: {
    gitUrl: string;
    namespace?: string;
    typeName?: string;
    planeName?: string;
  }): Promise<{
    namespace: string;
    typeName: string;
    yaml: string;
    variableCount: number;
    generatedTypeName: boolean;
    inferredNamespace: boolean;
  }> {
    const cluster = await this.selectCluster();
    const plane = opts.planeName || 'local';

    // Normalize inputs - trim whitespace and convert empty strings to undefined
    // This prevents malformed API paths and requests with whitespace-only values
    const normalizedGitUrl = opts.gitUrl.trim();
    const normalizedNamespace = opts.namespace?.trim() || undefined;
    const normalizedTypeName = opts.typeName?.trim() || undefined;

    // Validate required field after normalization
    if (!normalizedGitUrl) {
      throw new Error('gitUrl is required and cannot be empty');
    }

    // Default provider to Custom.Resources if no namespace is specified
    // This follows the convention that learned resource types without an explicit
    // namespace go into the Custom.Resources provider
    const provider = normalizedNamespace || 'Custom.Resources';

    // Build the learn endpoint path
    // Format: /planes/radius/{plane}/providers/System.Resources/resourceproviders/{provider}/resourcetypes/learn
    const path = makePath({
      scopes: [{ type: 'radius', value: plane }],
      type: 'System.Resources/resourceproviders',
      name: provider,
      action: 'resourcetypes/learn',
    });

    // Build the request body with normalized values - only include optional fields if provided
    const requestBody: {
      gitUrl: string;
      namespace?: string;
      typeName?: string;
    } = {
      gitUrl: normalizedGitUrl,
    };

    if (normalizedNamespace) {
      requestBody.namespace = normalizedNamespace;
    }

    if (normalizedTypeName) {
      requestBody.typeName = normalizedTypeName;
    }

    // Call the learn endpoint with POST
    const response = await this.makePostRequest<
      typeof requestBody,
      {
        resourceNamespace?: string;
        namespace?: string;
        typeName: string;
        yaml: string;
        variableCount: number;
        generatedTypeName: boolean;
        inferredNamespace: boolean;
      }
    >(cluster, path, requestBody);

    // Defensive response handling - check both possible field names for future compatibility
    // Backend currently uses 'resourceNamespace', but may use 'namespace' in the future
    const namespace = response.resourceNamespace ?? response.namespace;
    if (!namespace) {
      throw new Error(
        'Invalid API response: missing namespace field (expected resourceNamespace or namespace)',
      );
    }

    // Transform response to match interface
    return {
      namespace,
      typeName: response.typeName,
      yaml: response.yaml,
      variableCount: response.variableCount,
      generatedTypeName: response.generatedTypeName,
      inferredNamespace: response.inferredNamespace,
    };
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

  private async makePostRequest<TRequest, TResponse>(
    cluster: string,
    path: string,
    body: TRequest,
  ): Promise<TResponse> {
    const response = await this.kubernetesApi.proxy({
      clusterName: cluster,
      path: path,
      init: {
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'no-cache',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status}:\n\n${text}`);
    }

    const data = (await response.json()) as TResponse;
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
