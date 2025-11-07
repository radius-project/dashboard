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

  it('makePostRequest handles errors', async () => {
    const api = new RadiusApiImpl({
      getClusters: async () => {
        throw new Error('not implemented');
      },
      proxy: async () => Promise.resolve(new Response('error', { status: 400 })),
    });
    // eslint-disable-next-line dot-notation
    await expect(
      // eslint-disable-next-line dot-notation
      api['makePostRequest']('cluster', 'path', { test: 'data' }),
    ).rejects.toThrow('Request failed: 400:\n\nerror');
  });

  it('makePostRequest sends POST with JSON body', async () => {
    let capturedInit: RequestInit | undefined;
    const api = new RadiusApiImpl({
      getClusters: async () => [{ name: 'test-cluster', authProvider: 'test' }],
      proxy: async ({ init }) => {
        capturedInit = init;
        return Promise.resolve(
          new Response(JSON.stringify({ result: 'success' })),
        );
      },
    });
    // eslint-disable-next-line dot-notation
    const result = await api['makePostRequest']('cluster', 'path', {
      test: 'data',
    });

    expect(result).toEqual({ result: 'success' });
    expect(capturedInit?.method).toEqual('POST');
    expect(capturedInit?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(capturedInit?.body).toEqual(JSON.stringify({ test: 'data' }));
  });

  describe('learnResourceType', () => {
    it('defaults to Custom.Resources provider when namespace omitted', async () => {
      let capturedPath: string | undefined;
      let capturedBody: string | undefined;
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test-cluster', authProvider: 'test' }],
        proxy: async ({ path, init }) => {
          capturedPath = path;
          capturedBody = init?.body as string;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                resourceNamespace: 'Custom.Resources',
                typeName: 'testType',
                yaml: 'test: yaml',
                variableCount: 3,
                generatedTypeName: true,
                inferredNamespace: true,
              }),
            ),
          );
        },
      });

      await api.learnResourceType({
        gitUrl: 'https://github.com/test/repo',
      });

      // Verify path targets Custom.Resources provider
      expect(capturedPath).toContain(
        '/providers/System.Resources/resourceproviders/Custom.Resources/resourcetypes/learn',
      );
      expect(capturedPath).toContain('api-version=2023-10-01-preview');

      // Verify request body only includes gitUrl
      const parsedBody = JSON.parse(capturedBody || '{}');
      expect(parsedBody).toEqual({
        gitUrl: 'https://github.com/test/repo',
      });
      expect(parsedBody.namespace).toBeUndefined();
      expect(parsedBody.typeName).toBeUndefined();
    });

    it('uses explicit namespace in path and body when provided', async () => {
      let capturedPath: string | undefined;
      let capturedBody: string | undefined;
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test-cluster', authProvider: 'test' }],
        proxy: async ({ path, init }) => {
          capturedPath = path;
          capturedBody = init?.body as string;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                resourceNamespace: 'MyCompany.Resources',
                typeName: 'customType',
                yaml: 'custom: yaml',
                variableCount: 5,
                generatedTypeName: false,
                inferredNamespace: false,
              }),
            ),
          );
        },
      });

      await api.learnResourceType({
        gitUrl: 'https://github.com/test/repo',
        namespace: 'MyCompany.Resources',
        typeName: 'customType',
        planeName: 'production',
      });

      // Verify path uses the provided namespace as provider
      expect(capturedPath).toContain('planes/radius/production');
      expect(capturedPath).toContain(
        '/providers/System.Resources/resourceproviders/MyCompany.Resources/resourcetypes/learn',
      );

      // Verify request body includes all provided fields
      const parsedBody = JSON.parse(capturedBody || '{}');
      expect(parsedBody).toEqual({
        gitUrl: 'https://github.com/test/repo',
        namespace: 'MyCompany.Resources',
        typeName: 'customType',
      });
    });

    it('transforms response resourceNamespace to namespace', async () => {
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test-cluster', authProvider: 'test' }],
        proxy: async () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                resourceNamespace: 'Test.Namespace',
                typeName: 'testType',
                yaml: 'apiVersion: v1\nkind: Test',
                variableCount: 10,
                generatedTypeName: true,
                inferredNamespace: false,
              }),
            ),
          ),
      });

      const result = await api.learnResourceType({
        gitUrl: 'https://github.com/test/module',
      });

      // Verify response is properly transformed
      expect(result).toEqual({
        namespace: 'Test.Namespace', // Transformed from resourceNamespace
        typeName: 'testType',
        yaml: 'apiVersion: v1\nkind: Test',
        variableCount: 10,
        generatedTypeName: true,
        inferredNamespace: false,
      });
    });

    it('handles learn API errors', async () => {
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test-cluster', authProvider: 'test' }],
        proxy: async () =>
          Promise.resolve(
            new Response('Invalid Git URL provided', { status: 400 }),
          ),
      });

      await expect(
        api.learnResourceType({ gitUrl: 'invalid-url' }),
      ).rejects.toThrow('Request failed: 400:\n\nInvalid Git URL provided');
    });

    it('defaults planeName to local when not provided', async () => {
      let capturedPath: string | undefined;
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test-cluster', authProvider: 'test' }],
        proxy: async ({ path }) => {
          capturedPath = path;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                resourceNamespace: 'Custom.Resources',
                typeName: 'type',
                yaml: 'test',
                variableCount: 1,
                generatedTypeName: false,
                inferredNamespace: false,
              }),
            ),
          );
        },
      });

      await api.learnResourceType({ gitUrl: 'https://github.com/test/repo' });

      expect(capturedPath).toContain('planes/radius/local');
    });
  });

  describe('learnResourceType - input sanitization', () => {
    it('trims whitespace from namespace and falls back to Custom.Resources', async () => {
      let capturedPath: string | undefined;
      let capturedBody: string | undefined;
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test', authProvider: 'test' }],
        proxy: async ({ path, init }) => {
          capturedPath = path;
          capturedBody = init?.body as string;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                resourceNamespace: 'Custom.Resources',
                typeName: 'testType',
                yaml: 'test: yaml',
                variableCount: 3,
                generatedTypeName: true,
                inferredNamespace: true,
              }),
            ),
          );
        },
      });

      await api.learnResourceType({
        gitUrl: 'https://github.com/test/repo',
        namespace: '   ', // Whitespace-only
      });

      // Should use Custom.Resources in path
      expect(capturedPath).toContain(
        '/providers/System.Resources/resourceproviders/Custom.Resources/resourcetypes/learn',
      );

      // Should not include namespace in body
      const parsedBody = JSON.parse(capturedBody || '{}');
      expect(parsedBody.namespace).toBeUndefined();
    });

    it('trims whitespace from all string inputs', async () => {
      let capturedPath: string | undefined;
      let capturedBody: string | undefined;
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test', authProvider: 'test' }],
        proxy: async ({ path, init }) => {
          capturedPath = path;
          capturedBody = init?.body as string;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                resourceNamespace: 'MyCompany.Resources',
                typeName: 'customType',
                yaml: 'test',
                variableCount: 1,
                generatedTypeName: false,
                inferredNamespace: false,
              }),
            ),
          );
        },
      });

      await api.learnResourceType({
        gitUrl: '  https://github.com/test/repo  ',
        namespace: '  MyCompany.Resources  ',
        typeName: '  customType  ',
      });

      // Verify path uses trimmed namespace
      expect(capturedPath).toContain(
        '/resourceproviders/MyCompany.Resources/resourcetypes/learn',
      );

      // Verify body has trimmed values
      const parsedBody = JSON.parse(capturedBody || '{}');
      expect(parsedBody.gitUrl).toEqual('https://github.com/test/repo');
      expect(parsedBody.namespace).toEqual('MyCompany.Resources');
      expect(parsedBody.typeName).toEqual('customType');
    });

    it('throws error when gitUrl is whitespace-only', async () => {
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test', authProvider: 'test' }],
        proxy: async () =>
          Promise.resolve(new Response('should not be called')),
      });

      await expect(
        api.learnResourceType({ gitUrl: '   ' }),
      ).rejects.toThrow('gitUrl is required and cannot be empty');
    });

    it('throws error when gitUrl is empty string', async () => {
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test', authProvider: 'test' }],
        proxy: async () =>
          Promise.resolve(new Response('should not be called')),
      });

      await expect(api.learnResourceType({ gitUrl: '' })).rejects.toThrow(
        'gitUrl is required and cannot be empty',
      );
    });
  });

  describe('learnResourceType - defensive response handling', () => {
    it('handles response with namespace instead of resourceNamespace', async () => {
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test', authProvider: 'test' }],
        proxy: async () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                namespace: 'Future.API', // Using 'namespace' not 'resourceNamespace'
                typeName: 'testType',
                yaml: 'test: yaml',
                variableCount: 5,
                generatedTypeName: true,
                inferredNamespace: false,
              }),
            ),
          ),
      });

      const result = await api.learnResourceType({
        gitUrl: 'https://github.com/test/repo',
      });

      expect(result.namespace).toEqual('Future.API');
    });

    it('prefers resourceNamespace when both fields present', async () => {
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test', authProvider: 'test' }],
        proxy: async () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                resourceNamespace: 'Preferred.Namespace',
                namespace: 'Fallback.Namespace',
                typeName: 'testType',
                yaml: 'test',
                variableCount: 2,
                generatedTypeName: false,
                inferredNamespace: true,
              }),
            ),
          ),
      });

      const result = await api.learnResourceType({
        gitUrl: 'https://github.com/test/repo',
      });

      expect(result.namespace).toEqual('Preferred.Namespace');
    });

    it('throws error when both namespace fields are missing', async () => {
      const api = new RadiusApiImpl({
        getClusters: async () => [{ name: 'test', authProvider: 'test' }],
        proxy: async () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                // Neither resourceNamespace nor namespace provided
                typeName: 'testType',
                yaml: 'test',
                variableCount: 1,
                generatedTypeName: false,
                inferredNamespace: false,
              }),
            ),
          ),
      });

      await expect(
        api.learnResourceType({ gitUrl: 'https://github.com/test/repo' }),
      ).rejects.toThrow(
        'Invalid API response: missing namespace field (expected resourceNamespace or namespace)',
      );
    });
  });
});
