import { KubernetesApi } from '@backstage/plugin-kubernetes';
import { RadiusApiImpl } from './api';

const prefix = '/apis/api.ucp.dev/v1alpha3';
const plane = '/planes/radius/local';
const applicationId = `${plane}/resourceGroups/group-1/providers/Applications.Core/applications/app-1`;
const currentId = `${plane}/resourceGroups/group-1/providers/Radius.Core/applications/app-2`;
const environmentId = `${plane}/resourceGroups/group-1/providers/Applications.Core/environments/env-1`;
const application = {
  id: applicationId,
  name: 'app-1',
  type: 'Applications.Core/applications',
  systemData: {},
  properties: { provisioningState: 'Succeeded', environment: environmentId },
};
const typeInfo = {
  Name: 'Applications.Core/applications',
  Description: 'Application resource type',
  ResourceProviderNamespace: 'Applications.Core',
  APIVersions: { '2025-01-01': {}, '2023-10-01-preview': {} },
  APIVersionList: ['2025-01-01', '2023-10-01-preview'],
};

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

function host(
  respond: (
    request: Parameters<KubernetesApi['proxy']>[0],
  ) => Response | Promise<Response> = () => json(application),
) {
  const getClusters = jest.fn().mockResolvedValue([
    { name: 'first-cluster', authProvider: 'test' },
    { name: 'last-cluster', authProvider: 'test' },
  ]);
  const proxy = jest
    .fn<
      ReturnType<KubernetesApi['proxy']>,
      Parameters<KubernetesApi['proxy']>
    >()
    .mockImplementation(request =>
      Promise.resolve(
        request.path.includes('/resourceTypes/')
          ? json(typeInfo)
          : respond(request),
      ),
    );
  return { getClusters, proxy };
}

describe('shared query client through the Backstage transport', () => {
  it.each([
    ['Radius.Core', '2025-08-01-preview', true],
    ['Radius.Core', '2025-08-01', true],
    ['Radius.Core', '2026-01-01-preview', true],
    ['Radius.Core', '2025-07-31', false],
    ['Radius.Core', 'unknown', false],
    ['Applications.Core', '2025-08-01-preview', false],
  ])(
    'forwards the shared icon request policy for %s at %s',
    async (namespace, version, includeIcons) => {
      const kube = {
        getClusters: jest
          .fn()
          .mockResolvedValue([{ name: 'selected-cluster' }]),
        proxy: jest.fn().mockImplementation(({ path }) =>
          Promise.resolve(
            json(
              path.includes('/resourceTypes/')
                ? {
                    ...typeInfo,
                    Name: `${namespace}/applications`,
                    ResourceProviderNamespace: namespace,
                    APIVersionList: [version],
                    APIVersions: { [version]: {} },
                  }
                : { resources: [] },
            ),
          ),
        ),
      };
      const api = new RadiusApiImpl(kube);
      const id = currentId.replace('Radius.Core', namespace);
      await api.getApplicationGraph({ applicationId: id });

      expect(kube.proxy).toHaveBeenCalledWith(
        expect.objectContaining({
          clusterName: 'selected-cluster',
          path: `${prefix}${id}/getGraph?api-version=${version}`,
          init: expect.objectContaining({
            method: 'POST',
            ...(includeIcons
              ? {
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ includeIcons: true }),
                }
              : {}),
          }),
        }),
      );
      const discovery = kube.proxy.mock.calls.find(
        ([request]) => request.init.method === 'GET',
      )![0];
      expect(discovery.init.body).toBeUndefined();
      expect(discovery.init.headers).toBeUndefined();
      const graph = kube.proxy.mock.calls.find(
        ([request]) => request.init.method === 'POST',
      )![0];
      expect(graph.init.body).toBe(
        includeIcons ? JSON.stringify({ includeIcons: true }) : undefined,
      );
      expect(graph.init.headers).toEqual(
        includeIcons ? { 'Content-Type': 'application/json' } : undefined,
      );
    },
  );

  it('reports a failed graph POST that carries the icon request body', async () => {
    const kube = {
      getClusters: jest.fn().mockResolvedValue([{ name: 'selected-cluster' }]),
      proxy: jest.fn().mockImplementation(({ path, init }) => {
        if (path.includes('/resourceTypes/')) {
          return Promise.resolve(
            json({
              ...typeInfo,
              Name: 'Radius.Core/applications',
              ResourceProviderNamespace: 'Radius.Core',
              APIVersionList: ['2025-08-01-preview'],
              APIVersions: { '2025-08-01-preview': {} },
            }),
          );
        }
        expect(init.method).toBe('POST');
        expect(init.body).toBe(JSON.stringify({ includeIcons: true }));
        return Promise.resolve(
          new Response('bad icon request', { status: 400 }),
        );
      }),
    };
    const api = new RadiusApiImpl(kube);

    await expect(
      api.getApplicationGraph({ applicationId: currentId }),
    ).rejects.toThrow(/400/);
    expect(
      kube.proxy.mock.calls.filter(([r]) => r.init.method === 'POST'),
    ).toHaveLength(1);
  });

  it('CN-01 / CN-02 / CN-03 / CN-04: binds GET and graph POST to the first cluster and the same plane', async () => {
    const kube = host(request =>
      request.init?.method === 'POST'
        ? json({ name: 'app-1', resources: [] })
        : json(application),
    );
    const api = new RadiusApiImpl(kube);

    await expect(api.getResourceById({ id: applicationId })).resolves.toEqual(
      application,
    );
    kube.getClusters.mockResolvedValue([
      { name: 'last-cluster', authProvider: 'test' },
      { name: 'first-cluster', authProvider: 'test' },
    ]);
    await expect(api.getApplicationGraph({ applicationId })).resolves.toEqual({
      graph: { name: 'app-1', resources: [] },
      context: {
        connectionId: 'first-cluster',
        plane: { type: 'radius', name: 'local' },
        applicationId,
      },
    });

    expect(kube.getClusters).toHaveBeenCalledTimes(1);
    expect(
      kube.proxy.mock.calls.every(
        ([request]) => request.clusterName === 'first-cluster',
      ),
    ).toBe(true);
    expect(
      kube.proxy.mock.calls.every(([request]) =>
        request.path.startsWith(`${prefix}${plane}/`),
      ),
    ).toBe(true);
    expect(kube.proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `${prefix}${applicationId}/getGraph?api-version=2025-01-01`,
        init: expect.objectContaining({ method: 'POST' }),
      }),
    );
  });

  it('CN-07: uses an explicit host connection and plane for GET and graph POST without changing constructor requirements', async () => {
    const id = applicationId.replace('/radius/local/', '/radius/team.2/');
    const kube = host(request =>
      request.init?.method === 'POST'
        ? json({ name: 'selected-context', resources: [] })
        : json({ ...application, id }),
    );
    const context = {
      connectionId: 'chosen-cluster',
      plane: { type: 'radius', name: 'team.2' },
    };
    const api = new RadiusApiImpl(kube, context);
    context.connectionId = 'changed-after-construction';
    context.plane.name = 'changed-after-construction';

    await api.getResourceById({ id });
    await api.getApplicationGraph({ applicationId: id });

    expect(kube.getClusters).not.toHaveBeenCalled();
    expect(
      kube.proxy.mock.calls.every(
        ([request]) => request.clusterName === 'chosen-cluster',
      ),
    ).toBe(true);
    expect(
      kube.proxy.mock.calls.every(([request]) =>
        request.path.includes('/planes/radius/team.2/'),
      ),
    ).toBe(true);
  });

  it('does not reuse graph responses between injected contexts', async () => {
    const kube = host(request =>
      json({ name: request.clusterName, resources: [] }),
    );
    const first = new RadiusApiImpl(kube, {
      connectionId: 'first',
      plane: { type: 'radius', name: 'local' },
    });
    const second = new RadiusApiImpl(kube, {
      connectionId: 'second',
      plane: { type: 'radius', name: 'local' },
    });

    await expect(
      first.getApplicationGraph({ applicationId }),
    ).resolves.toMatchObject({
      graph: { name: 'first' },
      context: { connectionId: 'first' },
    });
    await expect(
      second.getApplicationGraph({ applicationId }),
    ).resolves.toMatchObject({
      graph: { name: 'second' },
      context: { connectionId: 'second' },
    });
  });

  it('CN-08 / ER-01: fails before proxy access when no cluster is configured, and permits a later retry', async () => {
    const kube = host();
    kube.getClusters.mockResolvedValueOnce([]);
    const api = new RadiusApiImpl(kube);

    await expect(api.listApplications()).rejects.toThrow(
      'No kubernetes clusters found',
    );
    expect(kube.proxy).not.toHaveBeenCalled();
    await expect(api.getResourceById({ id: applicationId })).resolves.toEqual(
      application,
    );
  });

  it.each([
    '',
    '/invalid/resource/id/without/providers',
    applicationId.replace('/radius/local/', '/radius/other/'),
    '/subscriptions/sub/resourceGroups/group/providers/Microsoft.Compute/virtualMachines/vm',
  ])(
    'rejects malformed or off-selected-plane IDs without proxy access: %s',
    async id => {
      const kube = host();
      const api = new RadiusApiImpl(kube);

      await expect(api.getResourceById({ id })).rejects.toThrow();
      expect(kube.proxy).not.toHaveBeenCalled();
    },
  );

  it('rejects a response for a different resource instead of reusing it', async () => {
    const api = new RadiusApiImpl(
      host(() => json({ ...application, id: currentId })),
    );
    await expect(api.getResourceById({ id: applicationId })).rejects.toThrow(
      'Radius resource response does not match the requested ID',
    );
  });

  it('keeps transport settings, dynamic API-version order and the request signal', async () => {
    const kube = host();
    const controller = new AbortController();
    await new RadiusApiImpl(kube).getResourceById({
      id: applicationId,
      signal: controller.signal,
    });

    expect(kube.proxy).toHaveBeenLastCalledWith({
      clusterName: 'first-cluster',
      path: `${prefix}${applicationId}?api-version=2025-01-01`,
      init: {
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'no-cache',
        method: 'GET',
        signal: controller.signal,
      },
    });
  });

  it.each([
    ['ER-03', 401, 'Unauthenticated'],
    ['ER-04', 403, 'Forbidden'],
    ['ER-05', 404, 'Not Found'],
    ['ER-06', 400, 'Unsupported API version'],
    ['ER-10', 503, 'Service Unavailable'],
  ])('%s: preserves the %i upstream failure', async (_id, status, body) => {
    const api = new RadiusApiImpl(host(() => new Response(body, { status })));
    await expect(api.getResourceById({ id: applicationId })).rejects.toThrow(
      `Request failed: ${status}:\n\n${body}`,
    );
  });

  it('ER-07: rejects malformed JSON instead of returning an empty resource', async () => {
    const api = new RadiusApiImpl(host(() => new Response('invalid JSON')));
    await expect(api.getResourceById({ id: applicationId })).rejects.toThrow();
  });

  it('rejects a malformed resource envelope instead of returning a successful empty inventory', async () => {
    const api = new RadiusApiImpl(host(() => json({})));
    await expect(api.listApplications()).rejects.toThrow(
      'Radius resource list must contain a value array',
    );
  });

  it('uses the existing explicit discovery overrides without changing the default graph context', async () => {
    const kube = host(() => json({ name: 'app-1', resources: [] }));
    const api = new RadiusApiImpl(kube);
    await api.getResourceType({
      namespace: 'Applications.Core',
      typeName: 'applications',
      planeName: 'other',
      clusterName: 'other-cluster',
    });
    expect(kube.proxy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clusterName: 'other-cluster',
        path: expect.stringContaining('/planes/radius/other/'),
      }),
    );

    await api.getApplicationGraph({ applicationId });
    expect(kube.proxy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clusterName: 'first-cluster',
        path: expect.stringContaining('/planes/radius/local/'),
      }),
    );
  });

  it('preserves provider fallback names, descriptions and schemas', async () => {
    const kube = host();
    const schema = {
      type: 'object',
      properties: { replicas: { type: 'number' } },
    };
    kube.proxy.mockImplementation(async ({ path }) =>
      path.includes('/resourceTypes/')
        ? new Response('Not Found', { status: 404 })
        : json({
            value: [
              {
                name: 'Contoso.Apps',
                resourceTypes: {
                  widgets: {
                    description: 'Provider supplied text',
                    apiVersions: { '2025-01-01': { Schema: schema } },
                  },
                },
              },
            ],
          }),
    );

    await expect(
      new RadiusApiImpl(kube).getResourceType({
        namespace: 'Contoso.Apps',
        typeName: 'widgets',
      }),
    ).resolves.toEqual({
      Name: 'Contoso.Apps/widgets',
      Description: 'Provider supplied text',
      ResourceProviderNamespace: 'Contoso.Apps',
      APIVersions: { '2025-01-01': { Schema: schema } },
      APIVersionList: ['2025-01-01'],
    });
  });

  it('ER-08 / #369: exposes partial namespace failure while preserving successful resources', async () => {
    const current = {
      ...application,
      id: currentId,
      name: 'app-2',
      type: 'Radius.Core/applications',
    };
    const kube = host(({ path }) =>
      path.includes('/Applications.Core/applications?')
        ? new Response('legacy namespace unavailable', { status: 503 })
        : json({ value: [current] }),
    );

    await expect(
      new RadiusApiImpl(kube).listApplications(),
    ).resolves.toMatchObject({
      value: [current],
      complete: false,
      errors: [
        {
          resourceType: 'Applications.Core/applications',
          error: new Error(
            'Request failed: 503:\n\nlegacy namespace unavailable',
          ),
        },
      ],
    });
  });

  it('ER-08: fails with the first namespace error if every list request fails', async () => {
    const api = new RadiusApiImpl(
      host(
        ({ path }) =>
          new Response(
            path.includes('/Applications.Core/')
              ? 'legacy unavailable'
              : 'current unavailable',
            { status: 503 },
          ),
      ),
    );
    await expect(api.listApplications()).rejects.toThrow('legacy unavailable');
  });

  it('preserves legacy-first order and exact-ID deduplication even when current type is requested', async () => {
    const current = {
      ...application,
      id: currentId,
      name: 'app-2',
      type: 'Radius.Core/applications',
    };
    const kube = host(({ path }) =>
      json({
        value: path.includes('/Applications.Core/applications?')
          ? [application]
          : [application, current],
      }),
    );

    await expect(
      new RadiusApiImpl(kube).listResources({
        resourceType: 'Radius.Core/applications',
      }),
    ).resolves.toEqual({
      value: [application, current],
      complete: true,
      errors: [],
    });
    expect(
      kube.proxy.mock.calls.filter(
        ([request]) => !request.path.includes('/resourceTypes/'),
      ),
    ).toHaveLength(2);
  });

  it('hydrates untyped inventory, skips deployments and returns explicit complete status', async () => {
    const kube = host(({ path }) => {
      if (path.endsWith('/resourceGroups?api-version=2023-10-01-preview')) {
        return json({ value: [{ name: 'group-1' }] });
      }
      if (path.includes('/resources?')) {
        return json({
          value: [
            { id: applicationId, type: application.type },
            {
              id: `${plane}/resourceGroups/group-1/providers/Microsoft.Resources/deployments/deploy-1`,
              type: 'Microsoft.Resources/deployments',
            },
          ],
        });
      }
      return json(application);
    });

    await expect(new RadiusApiImpl(kube).listResources()).resolves.toEqual({
      value: [application],
      complete: true,
      errors: [],
    });
    expect(
      kube.proxy.mock.calls.every(
        ([request]) => !request.path.includes('/deployments/'),
      ),
    ).toBe(true);
  });

  it('propagates cancellation through discovery without a fallback request', async () => {
    const controller = new AbortController();
    const kube = host();
    kube.proxy.mockImplementation(async () => {
      controller.abort();
      throw controller.signal.reason;
    });

    await expect(
      new RadiusApiImpl(kube).getApplicationGraph({
        applicationId,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(kube.proxy).toHaveBeenCalledTimes(1);
  });

  it('does not accept an aborted late graph response', async () => {
    const controller = new AbortController();
    const kube = host(() => {
      controller.abort();
      return json({ name: 'late-response', resources: [] });
    });

    await expect(
      new RadiusApiImpl(kube).getApplicationGraph({
        applicationId,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
