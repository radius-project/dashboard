import { KubernetesApi } from '@backstage/plugin-kubernetes';
import { RadiusApiImpl } from './api';
import { connectionKey } from './connections';

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
  const getClusters = jest
    .fn()
    .mockResolvedValue([{ name: 'first-cluster', authProvider: 'test' }]);
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

  it('CN-02 / CN-03 / CN-04: requires a choice and binds GET and graph POST to it regardless of cluster order', async () => {
    const kube = host(request =>
      request.init?.method === 'POST'
        ? json({ name: 'app-1', resources: [] })
        : json(application),
    );
    kube.getClusters.mockResolvedValue([
      { name: 'first-cluster', authProvider: 'test' },
      { name: 'last-cluster', authProvider: 'test' },
    ]);
    const api = new RadiusApiImpl(kube);

    await expect(api.getResourceById({ id: applicationId })).rejects.toThrow(
      'Select a Radius connection',
    );
    expect(kube.proxy).not.toHaveBeenCalled();
    api.connections.select(
      connectionKey({
        connectionId: 'first-cluster',
        plane: { type: 'radius', name: 'local' },
      }),
    );
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

    expect(kube.getClusters).toHaveBeenCalledTimes(3);
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

  it('CN-01 / CN-07: selects only a configured cluster/plane pair and excludes unavailable host clusters', async () => {
    const id = applicationId.replace('/radius/local/', '/radius/team/');
    const kube = host(() => json({ ...application, id }));
    const api = new RadiusApiImpl(kube, undefined, [
      {
        connectionId: 'missing-cluster',
        plane: { type: 'radius', name: 'local' },
      },
      {
        connectionId: 'first-cluster',
        plane: { type: 'radius', name: 'team' },
      },
    ]);
    await expect(api.getResourceById({ id })).resolves.toMatchObject({ id });
    expect(api.connections.getSnapshot().connections).toEqual([
      {
        connectionId: 'first-cluster',
        plane: { type: 'radius', name: 'team' },
      },
    ]);
    expect(
      kube.proxy.mock.calls.every(
        ([request]) =>
          request.clusterName === 'first-cluster' &&
          request.path.includes('/planes/radius/team/'),
      ),
    ).toBe(true);
    const none = new RadiusApiImpl(kube, undefined, []);
    await expect(none.listApplications()).rejects.toThrow(
      'No Radius connections are available',
    );
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
      'No Radius connections are available',
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
        signal: expect.any(AbortSignal),
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

  it('does not bind the shared client to a completed caller signal', async () => {
    const kube = host();
    const api = new RadiusApiImpl(kube);
    const controller = new AbortController();
    await api.getResourceById({ id: applicationId, signal: controller.signal });
    controller.abort();
    await expect(api.getResourceById({ id: applicationId })).resolves.toEqual(
      application,
    );
  });

  it('CN-05 / CN-06 / CN-07: aborts superseded graph work, rejects an ignored abort and rediscovers the selected plane', async () => {
    let release!: (response: Response) => void;
    let started!: () => void;
    const graphStarted = new Promise<void>(resolve => {
      started = resolve;
    });
    const oldResponse = new Promise<Response>(resolve => {
      release = resolve;
    });
    const kube = host(({ init }) => {
      if (init?.method === 'POST') {
        started();
        return oldResponse;
      }
      return json(application);
    });
    const contexts = [
      {
        connectionId: 'first-cluster',
        plane: { type: 'radius', name: 'local' },
      },
      {
        connectionId: 'first-cluster',
        plane: { type: 'radius', name: 'team.2' },
      },
    ];
    const api = new RadiusApiImpl(kube, undefined, contexts);
    await api.connections.refresh();
    api.connections.select(connectionKey(contexts[0]));
    const oldGraph = api.getApplicationGraph({ applicationId });
    await graphStarted;
    const oldSignal = kube.proxy.mock.calls.find(
      ([r]) => r.init?.method === 'POST',
    )![0].init!.signal!;

    api.connections.select(connectionKey(contexts[1]));
    expect(oldSignal.aborted).toBe(true);
    await expect(oldGraph).rejects.toThrow('Radius connection changed');
    kube.proxy.mockImplementation(async ({ path, init }) => {
      if (path.includes('/resourceTypes/')) {
        return json({
          ...typeInfo,
          APIVersions: { '2026-01-01': {} },
          APIVersionList: ['2026-01-01'],
        });
      }
      if (init?.method === 'POST') {
        return json({ resources: [], name: 'new plane' });
      }
      return json({
        ...application,
        id: applicationId.replace('/radius/local/', '/radius/team.2/'),
      });
    });
    const nextId = applicationId.replace('/radius/local/', '/radius/team.2/');
    await api.getResourceById({ id: nextId });
    await expect(
      api.getApplicationGraph({ applicationId: nextId }),
    ).resolves.toMatchObject({
      graph: { name: 'new plane' },
      context: { ...contexts[1], applicationId: nextId },
    });
    expect(kube.proxy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: `${prefix}${nextId}/getGraph?api-version=2026-01-01`,
      }),
    );
    release(json({ resources: [], name: 'late old plane' }));
    await expect(oldGraph).rejects.toThrow('Radius connection changed');
  });

  it('CN-08: removal cancels old work without silently selecting the remaining cluster', async () => {
    let started!: () => void;
    const requestStarted = new Promise<void>(resolve => {
      started = resolve;
    });
    const kube = host(() => {
      started();
      return new Promise<Response>(() => {});
    });
    const api = new RadiusApiImpl(kube);
    const oldRequest = api.getResourceById({ id: applicationId });
    await requestStarted;
    const signal = kube.proxy.mock.calls.at(-1)![0].init!.signal!;
    kube.getClusters.mockResolvedValue([
      { name: 'remaining', authProvider: 'test' },
    ]);
    await api.connections.refresh();
    expect(signal.aborted).toBe(true);
    await expect(oldRequest).rejects.toThrow('Radius connection changed');
    expect(api.connections.getSnapshot().selected).toBeUndefined();
    await expect(api.getResourceById({ id: applicationId })).rejects.toThrow(
      'connection was removed',
    );
    api.connections.select(
      connectionKey({
        connectionId: 'remaining',
        plane: { type: 'radius', name: 'local' },
      }),
    );
    kube.proxy.mockImplementation(async ({ path }) =>
      json(path.includes('/resourceTypes/') ? typeInfo : application),
    );
    await expect(api.getResourceById({ id: applicationId })).resolves.toEqual(
      application,
    );
    expect(kube.proxy).toHaveBeenLastCalledWith(
      expect.objectContaining({ clusterName: 'remaining' }),
    );
  });

  it('reports discovery failure, permits recovery and rejects an unknown selection', async () => {
    const kube = host();
    const api = new RadiusApiImpl(kube);
    kube.getClusters.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(api.listApplications()).rejects.toThrow(
      'check your host access. Forbidden',
    );
    expect(kube.proxy).not.toHaveBeenCalled();
    await expect(api.getResourceById({ id: applicationId })).resolves.toEqual(
      application,
    );
    api.connections.select('unknown');
    await expect(api.getResourceById({ id: applicationId })).rejects.toThrow(
      'connection was removed',
    );
    expect(kube.proxy).toHaveBeenCalledTimes(2);
  });

  it('CN-05: does not move an old operation to the new cluster while host discovery is pending', async () => {
    const kube = host();
    const clusters = [
      { name: 'first-cluster', authProvider: 'test' },
      { name: 'second-cluster', authProvider: 'test' },
    ];
    kube.getClusters.mockResolvedValue(clusters);
    const api = new RadiusApiImpl(kube);
    await api.connections.refresh();
    const [first, second] = api.connections.getSnapshot().connections;
    api.connections.select(connectionKey(first));
    let release!: (value: typeof clusters) => void;
    kube.getClusters.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      }),
    );
    const oldRequest = api.getResourceById({ id: applicationId });
    api.connections.select(connectionKey(second));
    await expect(oldRequest).rejects.toThrow('Radius connection changed');
    release(clusters);
    await api.connections.refresh();
    expect(kube.proxy).not.toHaveBeenCalled();
  });
});
