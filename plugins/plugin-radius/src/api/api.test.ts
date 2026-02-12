import { makePath, makePathForId, RadiusApiImpl } from './api';

describe('makePath', () => {
  it('makes path for scopes', () => {
    const path = makePath({ scopes: [{ type: 'radius', value: 'local' }] });
    expect(path).toEqual(makePathForId('/planes/radius/local'));
  });
  it('makes path for multiple scopes', () => {
    const path = makePath({
      scopes: [
        { type: 'radius', value: 'local' },
        {
          type: 'resourceGroups',
          value: 'test-group',
        },
      ],
    });
    expect(path).toEqual(
      makePathForId('/planes/radius/local/resourceGroups/test-group'),
    );
  });
  it('makes path for scope list', () => {
    const path = makePath({
      scopes: [
        { type: 'radius', value: 'local' },
        {
          type: 'resourceGroups',
        },
      ],
    });
    expect(path).toEqual(makePathForId('/planes/radius/local/resourceGroups'));
  });
  it('makes path for scope action', () => {
    const path = makePath({
      scopes: [{ type: 'radius', value: 'local' }],
      action: 'action',
    });
    expect(path).toEqual(makePathForId('/planes/radius/local/action'));
  });
  it('makes path for resource type without name', () => {
    const path = makePath({
      scopes: [{ type: 'radius', value: 'local' }],
      type: 'Applications.Core/applications',
    });
    expect(path).toEqual(
      makePathForId(
        '/planes/radius/local/providers/Applications.Core/applications',
      ),
    );
  });
  it('makes path for resource type with name', () => {
    const path = makePath({
      scopes: [{ type: 'radius', value: 'local' }],
      type: 'Applications.Core/applications',
      name: 'test-app',
    });
    expect(path).toEqual(
      makePathForId(
        '/planes/radius/local/providers/Applications.Core/applications/test-app',
      ),
    );
  });
  it('makes path for resource type with name and action', () => {
    const path = makePath({
      scopes: [{ type: 'radius', value: 'local' }],
      type: 'Applications.Core/applications',
      name: 'test-app',
      action: 'restart',
    });
    expect(path).toEqual(
      makePathForId(
        '/planes/radius/local/providers/Applications.Core/applications/test-app/restart',
      ),
    );
  });

  describe('with customApiVersion', () => {
    it('passes custom API version to makePathForId', () => {
      const path = makePath({
        scopes: [{ type: 'radius', value: 'local' }],
        type: 'Applications.Core/applications',
        customApiVersion: '2024-01-01-preview',
      });
      expect(path).toEqual(
        '/apis/api.ucp.dev/v1alpha3/planes/radius/local/providers/Applications.Core/applications?api-version=2024-01-01-preview',
      );
    });

    it('uses default API version when customApiVersion not provided', () => {
      const path = makePath({
        scopes: [{ type: 'radius', value: 'local' }],
        type: 'Applications.Core/applications',
      });
      expect(path).toEqual(
        '/apis/api.ucp.dev/v1alpha3/planes/radius/local/providers/Applications.Core/applications?api-version=2023-10-01-preview',
      );
    });

    it('handles customApiVersion with resource name', () => {
      const path = makePath({
        scopes: [{ type: 'radius', value: 'local' }],
        type: 'Applications.Core/applications',
        name: 'test-app',
        customApiVersion: '2024-01-01-preview',
      });
      expect(path).toEqual(
        '/apis/api.ucp.dev/v1alpha3/planes/radius/local/providers/Applications.Core/applications/test-app?api-version=2024-01-01-preview',
      );
    });
  });
});

describe('makePathForId', () => {
  it('uses custom API version when provided', () => {
    const path = makePathForId(
      '/planes/radius/local/test',
      '2024-01-01-preview',
    );
    expect(path).toEqual(
      '/apis/api.ucp.dev/v1alpha3/planes/radius/local/test?api-version=2024-01-01-preview',
    );
  });

  it('uses default API version when customApiVersion is undefined', () => {
    const path = makePathForId('/planes/radius/local/test');
    expect(path).toEqual(
      '/apis/api.ucp.dev/v1alpha3/planes/radius/local/test?api-version=2023-10-01-preview',
    );
  });

  it('uses default API version when customApiVersion is null', () => {
    const path = makePathForId('/planes/radius/local/test', undefined);
    expect(path).toEqual(
      '/apis/api.ucp.dev/v1alpha3/planes/radius/local/test?api-version=2023-10-01-preview',
    );
  });

  it('handles empty string customApiVersion', () => {
    const path = makePathForId('/planes/radius/local/test', '');
    expect(path).toEqual(
      '/apis/api.ucp.dev/v1alpha3/planes/radius/local/test?api-version=2023-10-01-preview',
    );
  });
});

describe('RadiusApi', () => {
  it('selectCluster returns first cluster', async () => {
    const api = new RadiusApiImpl({
      getClusters: async () => [
        { name: 'test-cluster1', authProvider: 'test' },
        {
          name: 'test-cluster2',
          authProvider: 'test',
        },
      ],
      proxy: async () => {
        throw new Error('not implemented');
      },
    });
    // eslint-disable-next-line dot-notation
    expect(await api['selectCluster']()).toEqual('test-cluster1');
  });
  it('makeRequest handles errors', async () => {
    const api = new RadiusApiImpl({
      getClusters: async () => {
        throw new Error('not implemented');
      },
      proxy: async () => Promise.resolve(new Response('test', { status: 404 })),
    });
    // eslint-disable-next-line dot-notation
    await expect(api['makeRequest']('cluster', 'path')).rejects.toThrow(
      'Request failed: 404:\n\ntest',
    );
  });
  it('makeRequest expects JSON', async () => {
    const api = new RadiusApiImpl({
      getClusters: async () => {
        throw new Error('not implemented');
      },
      proxy: async () => Promise.resolve(new Response('test')),
    });
    // eslint-disable-next-line dot-notation
    await expect(api['makeRequest']('cluster', 'path')).rejects.toThrow(
      'invalid json response body at  reason: Unexpected token \'e\', "test" is not valid JSON',
    );
  });
  it('makeRequest parses JSON', async () => {
    const api = new RadiusApiImpl({
      getClusters: async () => {
        throw new Error('not implemented');
      },
      proxy: async () => Promise.resolve(new Response('{ "message": "test" }')),
    });
    // eslint-disable-next-line dot-notation
    await expect(api['makeRequest']('cluster', 'path')).resolves.toEqual({
      message: 'test',
    });
  });

  describe('Dynamic API Version Features', () => {
    describe('extractResourceTypeFromId', () => {
      let api: RadiusApiImpl;

      beforeEach(() => {
        api = new RadiusApiImpl({
          getClusters: async () => [],
          proxy: async () => Promise.resolve(new Response('{}')),
        });
      });

      it('extracts resource type from valid resource ID', () => {
        const id =
          '/planes/radius/local/resourceGroups/my-group/providers/Applications.Core/applications/my-app';
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId'](id);
        expect(result).toEqual('Applications.Core/applications');
      });

      it('extracts resource type from database resource ID', () => {
        const id =
          '/planes/radius/local/resourceGroups/my-group/providers/Radius.Data/postgreSqlDatabases/postgresql';
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId'](id);
        expect(result).toEqual('Radius.Data/postgreSqlDatabases');
      });

      it('extracts resource type from containerized resource ID', () => {
        const id =
          '/planes/radius/local/resourceGroups/my-group/providers/Applications.Dapr/daprStateStores/redis-state';
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId'](id);
        expect(result).toEqual('Applications.Dapr/daprStateStores');
      });

      it('returns null for ID without providers section', () => {
        const id = '/planes/radius/local/resourceGroups/my-group';
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId'](id);
        expect(result).toBeNull();
      });

      it('returns null for malformed resource ID', () => {
        const id = '/invalid/resource/id/structure';
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId'](id);
        expect(result).toBeNull();
      });

      it('returns null for empty string', () => {
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId']('');
        expect(result).toBeNull();
      });

      it('handles resource ID with trailing slash', () => {
        const id =
          '/planes/radius/local/resourceGroups/my-group/providers/Applications.Core/applications/my-app/';
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId'](id);
        expect(result).toEqual('Applications.Core/applications');
      });

      it('handles resource ID with multiple providers sections', () => {
        const id =
          '/planes/radius/local/resourceGroups/my-group/providers/Applications.Core/applications/providers/nested';
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId'](id);
        expect(result).toEqual('Applications.Core/applications');
      });

      it('handles resource ID with special characters in type', () => {
        const id =
          '/planes/radius/local/resourceGroups/my-group/providers/Custom.Provider-v2/special_resource-type/instance';
        // eslint-disable-next-line dot-notation
        const result = api['extractResourceTypeFromId'](id);
        expect(result).toEqual('Custom.Provider-v2/special_resource-type');
      });
    });

    describe('getBestApiVersion', () => {
      it('returns first API version when resource type exists', async () => {
        const mockTypeInfo = {
          Name: 'Applications.Core/applications',
          Description: 'Application resource type',
          ResourceProviderNamespace: 'Applications.Core',
          APIVersions: {
            '2024-01-01-preview': { Schema: {} },
            '2023-10-01-preview': { Schema: {} },
          },
          APIVersionList: ['2024-01-01-preview', '2023-10-01-preview'],
        };

        const api = new RadiusApiImpl({
          getClusters: async () => [
            { name: 'test-cluster', authProvider: 'test' },
          ],
          proxy: async () =>
            Promise.resolve(new Response(JSON.stringify(mockTypeInfo))),
        });

        // eslint-disable-next-line dot-notation
        const result = await api['getBestApiVersion'](
          'Applications.Core/applications',
        );
        expect(result).toEqual('2024-01-01-preview');
      });

      it('returns default version when API version list is empty', async () => {
        const mockTypeInfo = {
          Name: 'Applications.Core/applications',
          Description: 'Application resource type',
          ResourceProviderNamespace: 'Applications.Core',
          APIVersions: {},
          APIVersionList: [],
        };

        const api = new RadiusApiImpl({
          getClusters: async () => [
            { name: 'test-cluster', authProvider: 'test' },
          ],
          proxy: async () =>
            Promise.resolve(new Response(JSON.stringify(mockTypeInfo))),
        });

        // eslint-disable-next-line dot-notation
        const result = await api['getBestApiVersion'](
          'Applications.Core/applications',
        );
        expect(result).toEqual('2023-10-01-preview');
      });

      it('returns default version when getResourceType throws error', async () => {
        const api = new RadiusApiImpl({
          getClusters: async () => [
            { name: 'test-cluster', authProvider: 'test' },
          ],
          proxy: async () =>
            Promise.resolve(new Response('error', { status: 404 })),
        });

        // eslint-disable-next-line dot-notation
        const result = await api['getBestApiVersion'](
          'NonExistent.Provider/invalidType',
        );
        expect(result).toEqual('2023-10-01-preview');
      });

      it('returns default version when resource type format is invalid', async () => {
        const api = new RadiusApiImpl({
          getClusters: async () => [
            { name: 'test-cluster', authProvider: 'test' },
          ],
          proxy: async () => Promise.resolve(new Response('{}')),
        });

        // eslint-disable-next-line dot-notation
        const result = await api['getBestApiVersion']('invalid-format');
        expect(result).toEqual('2023-10-01-preview');
      });

      it('handles network errors gracefully', async () => {
        const api = new RadiusApiImpl({
          getClusters: async () => {
            throw new Error('Network error');
          },
          proxy: async () => {
            throw new Error('Network error');
          },
        });

        // eslint-disable-next-line dot-notation
        const result = await api['getBestApiVersion'](
          'Applications.Core/applications',
        );
        expect(result).toEqual('2023-10-01-preview');
      });

      it('handles malformed response from getResourceType', async () => {
        const api = new RadiusApiImpl({
          getClusters: async () => [
            { name: 'test-cluster', authProvider: 'test' },
          ],
          proxy: async () => Promise.resolve(new Response('invalid json')),
        });

        // eslint-disable-next-line dot-notation
        const result = await api['getBestApiVersion'](
          'Applications.Core/applications',
        );
        expect(result).toEqual('2023-10-01-preview');
      });

      it('handles response with missing APIVersionList', async () => {
        const mockTypeInfo = {
          Name: 'Applications.Core/applications',
          Description: 'Application resource type',
          ResourceProviderNamespace: 'Applications.Core',
          APIVersions: {},
        };

        const api = new RadiusApiImpl({
          getClusters: async () => [
            { name: 'test-cluster', authProvider: 'test' },
          ],
          proxy: async () =>
            Promise.resolve(new Response(JSON.stringify(mockTypeInfo))),
        });

        // eslint-disable-next-line dot-notation
        const result = await api['getBestApiVersion'](
          'Applications.Core/applications',
        );
        expect(result).toEqual('2023-10-01-preview');
      });
    });

    describe('Enhanced Methods Integration', () => {
      describe('listResources with dynamic versions', () => {
        it('uses dynamic API version for specific resource type', async () => {
          const mockResourceList = {
            value: [{ id: 'test-1', name: 'test-app' }],
          };
          const mockTypeInfo = {
            Name: 'Applications.Core/applications',
            Description: 'Application resource type',
            ResourceProviderNamespace: 'Applications.Core',
            APIVersions: { '2024-01-01-preview': {} },
            APIVersionList: ['2024-01-01-preview'],
          };

          let requestedPath = '';
          const api = new RadiusApiImpl({
            getClusters: async () => [
              { name: 'test-cluster', authProvider: 'test' },
            ],
            proxy: async ({ path }: { path: string }) => {
              requestedPath = path;
              // First call for getResourceType, second for actual resource list
              if (
                path.includes(
                  'providers/Applications.Core/resourceTypes/applications',
                )
              ) {
                return Promise.resolve(
                  new Response(JSON.stringify(mockTypeInfo)),
                );
              }
              return Promise.resolve(
                new Response(JSON.stringify(mockResourceList)),
              );
            },
          });

          const result = await api.listResources({
            resourceType: 'Applications.Core/applications',
          });

          expect(result).toEqual(mockResourceList);
          // Verify the final request used the dynamic API version
          expect(requestedPath).toContain('api-version=2024-01-01-preview');
        });

        it('falls back to listing all resource groups when no resourceType specified', async () => {
          const mockGroups = {
            value: [{ name: 'group1', id: '/groups/group1' }],
          };
          const mockGroupResources = {
            value: [
              {
                id: '/planes/radius/local/resourceGroups/group1/providers/Applications.Core/applications/app1',
                type: 'Applications.Core/applications',
                name: 'app1',
              },
            ],
          };
          const mockResource = {
            id: '/planes/radius/local/resourceGroups/group1/providers/Applications.Core/applications/app1',
            name: 'app1',
            properties: { environment: '/env/test' },
          };

          const api = new RadiusApiImpl({
            getClusters: async () => [
              { name: 'test-cluster', authProvider: 'test' },
            ],
            proxy: async ({ path }: { path: string }) => {
              if (path.includes('/resourceGroups?')) {
                return Promise.resolve(
                  new Response(JSON.stringify(mockGroups)),
                );
              }
              if (path.includes('/resources?')) {
                return Promise.resolve(
                  new Response(JSON.stringify(mockGroupResources)),
                );
              }
              if (path.includes('Applications.Core/applications/app1')) {
                return Promise.resolve(
                  new Response(JSON.stringify(mockResource)),
                );
              }
              return Promise.resolve(new Response('{}'));
            },
          });

          const result = await api.listResources();
          expect(result.value).toHaveLength(1);
          expect(result.value[0].name).toEqual('app1');
        });
      });

      describe('getResourceById with dynamic versions', () => {
        it('uses dynamic API version when resource type can be extracted', async () => {
          const resourceId =
            '/planes/radius/local/resourceGroups/my-group/providers/Applications.Core/applications/my-app';
          const mockTypeInfo = {
            Name: 'Applications.Core/applications',
            Description: 'Application resource type',
            ResourceProviderNamespace: 'Applications.Core',
            APIVersions: { '2024-01-01-preview': {} },
            APIVersionList: ['2024-01-01-preview'],
          };
          const mockResource = {
            id: resourceId,
            name: 'my-app',
            properties: { environment: '/env/test' },
          };

          let resourceRequestPath = '';
          const api = new RadiusApiImpl({
            getClusters: async () => [
              { name: 'test-cluster', authProvider: 'test' },
            ],
            proxy: async ({ path }: { path: string }) => {
              if (path.includes('resourceTypes/applications')) {
                return Promise.resolve(
                  new Response(JSON.stringify(mockTypeInfo)),
                );
              }
              if (path.includes(resourceId)) {
                resourceRequestPath = path;
                return Promise.resolve(
                  new Response(JSON.stringify(mockResource)),
                );
              }
              return Promise.resolve(new Response('{}'));
            },
          });

          const result = await api.getResourceById({ id: resourceId });

          expect(result.name).toEqual('my-app');
          // Verify the resource request used the dynamic API version
          expect(resourceRequestPath).toContain(
            'api-version=2024-01-01-preview',
          );
        });

        it('falls back to default API version when resource type cannot be extracted', async () => {
          const resourceId = '/invalid/resource/id/without/providers';
          const mockResource = {
            id: resourceId,
            name: 'fallback-resource',
            properties: {},
          };

          let resourceRequestPath = '';
          const api = new RadiusApiImpl({
            getClusters: async () => [
              { name: 'test-cluster', authProvider: 'test' },
            ],
            proxy: async ({ path }: { path: string }) => {
              resourceRequestPath = path;
              return Promise.resolve(
                new Response(JSON.stringify(mockResource)),
              );
            },
          });

          const result = await api.getResourceById({ id: resourceId });

          expect(result.name).toEqual('fallback-resource');
          // Verify it used the default API version
          expect(resourceRequestPath).toContain(
            'api-version=2023-10-01-preview',
          );
        });

        it('falls back to default API version when getBestApiVersion fails', async () => {
          const resourceId =
            '/planes/radius/local/resourceGroups/my-group/providers/InvalidProvider/invalidType/resource';
          const mockResource = {
            id: resourceId,
            name: 'error-fallback-resource',
            properties: {},
          };

          let resourceRequestPath = '';
          const api = new RadiusApiImpl({
            getClusters: async () => [
              { name: 'test-cluster', authProvider: 'test' },
            ],
            proxy: async ({ path }: { path: string }) => {
              if (path.includes('resourceTypes/invalidType')) {
                return Promise.resolve(
                  new Response('Not Found', { status: 404 }),
                );
              }
              resourceRequestPath = path;
              return Promise.resolve(
                new Response(JSON.stringify(mockResource)),
              );
            },
          });

          const result = await api.getResourceById({ id: resourceId });

          expect(result.name).toEqual('error-fallback-resource');
          // Verify it fell back to default API version
          expect(resourceRequestPath).toContain(
            'api-version=2023-10-01-preview',
          );
        });
      });

      describe('Error Handling and Edge Cases', () => {
        it('handles chain of failures gracefully in getResourceById', async () => {
          const resourceId =
            '/planes/radius/local/resourceGroups/my-group/providers/Applications.Core/applications/my-app';
          const mockResource = {
            id: resourceId,
            name: 'my-app',
            properties: {},
          };

          let proxyCallCount = 0;
          const api = new RadiusApiImpl({
            getClusters: async () => [
              { name: 'test-cluster', authProvider: 'test' },
            ],
            proxy: async ({ path }: { path: string }) => {
              proxyCallCount++;
              if (
                path.includes('resourceTypes/applications') &&
                proxyCallCount === 1
              ) {
                throw new Error('Network error');
              }
              return Promise.resolve(
                new Response(JSON.stringify(mockResource)),
              );
            },
          });

          const result = await api.getResourceById({ id: resourceId });
          expect(result.name).toEqual('my-app');
          expect(proxyCallCount).toEqual(3); // getResourceType makes 2 calls (specific + fallback), then resource fetch
        });

        it('handles timeout scenarios in getBestApiVersion', async () => {
          const api = new RadiusApiImpl({
            getClusters: async () => [
              { name: 'test-cluster', authProvider: 'test' },
            ],
            proxy: async () => {
              return new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout')), 100);
              });
            },
          });

          // eslint-disable-next-line dot-notation
          const result = await api['getBestApiVersion'](
            'Applications.Core/applications',
          );
          expect(result).toEqual('2023-10-01-preview');
        });

        it('handles listResources with dynamic version resolution error', async () => {
          const mockResourceList = {
            value: [{ id: 'test-1', name: 'test-app' }],
          };

          let proxyCallCount = 0;
          const api = new RadiusApiImpl({
            getClusters: async () => [
              { name: 'test-cluster', authProvider: 'test' },
            ],
            proxy: async ({ path }: { path: string }) => {
              proxyCallCount++;
              if (
                path.includes('resourceTypes/applications') &&
                proxyCallCount === 1
              ) {
                return Promise.resolve(
                  new Response('Server Error', { status: 500 }),
                );
              }
              return Promise.resolve(
                new Response(JSON.stringify(mockResourceList)),
              );
            },
          });

          const result = await api.listResources({
            resourceType: 'Applications.Core/applications',
          });
          expect(result).toEqual(mockResourceList);
          expect(proxyCallCount).toEqual(3); // getBestApiVersion makes 2 calls (specific + fallback), then resource list
        });
      });
    });
  });
});
