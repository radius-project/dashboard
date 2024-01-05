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
});
