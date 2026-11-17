import { createRadiusQueryClient } from './query';
import { QuerySession } from './querySession';
import type { RadiusQueryPort, RadiusQueryRequest } from './queryContracts';

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

const plane = '/planes/radius/local';
const prefix = '/apis/api.ucp.dev/v1alpha3';
const context = {
  connectionId: 'selected',
  plane: { type: 'radius', name: 'local' },
};
const id = (type = 'Applications.Core/applications', name = 'app') =>
  `${plane}/resourceGroups/test/providers/${type}/${name}`;
const resource = (
  type = 'Applications.Core/applications',
  name = 'app',
  properties = {},
) => ({
  id: id(type, name),
  type,
  name,
  systemData: {},
  properties,
});
const discovery = {
  Name: 'Applications.Core/applications',
  APIVersions: { older: { Schema: { type: 'object' } }, newer: {} },
  APIVersionList: ['newer', 'older'],
};

function harness(
  respond: (request: RadiusQueryRequest) => unknown | Promise<unknown>,
  concurrency?: number,
) {
  const calls: RadiusQueryRequest[] = [];
  const port: RadiusQueryPort = {
    async request<T>(request: RadiusQueryRequest): Promise<T> {
      calls.push(request);
      // This fake models the host's decoded-response boundary.
      return (await respond(request)) as T;
    },
  };
  return {
    calls,
    client: createRadiusQueryClient(port, context, { concurrency }),
  };
}

describe('public Radius query operations', () => {
  it('passes a released slot onward when the awakened request is cancelled', async () => {
    const release = deferred();
    const request = jest
      .fn()
      .mockReturnValueOnce(release.promise)
      .mockResolvedValue({});
    const session = new QuerySession({ request }, context, 1);
    const controller = new AbortController();
    const first = session.request('/first', 'version');
    const second = session.request('/second', 'version', controller.signal);
    const third = session.request('/third', 'version');
    const cancelled = second.catch((error: unknown) => error);
    release.resolve();
    queueMicrotask(() =>
      controller.abort(new Error('awakened request cancelled')),
    );
    const [, failure] = await Promise.all([first, cancelled, third]);
    expect(failure).toEqual(new Error('awakened request cancelled'));
    expect(request.mock.calls.map(([call]) => call.path)).toEqual([
      `${prefix}/first?api-version=version`,
      `${prefix}/third?api-version=version`,
    ]);
  });

  it('uses the selected connection and original ID with per-type version order and no mutation', async () => {
    const upstream = resource();
    const { client, calls } = harness(({ path }) =>
      path.includes('/resourceTypes/') ? discovery : upstream,
    );
    expect(await client.getResourceById({ id: upstream.id })).toBe(upstream);
    expect(calls.map(call => call.path)).toEqual([
      `${prefix}${plane}/providers/Applications.Core/resourceTypes/applications?api-version=2023-10-01-preview`,
      `${prefix}${upstream.id}?api-version=newer`,
    ]);
    expect(
      calls.every(
        call =>
          call.connectionId === 'selected' &&
          call.plane.name === 'local' &&
          call.method === 'GET',
      ),
    ).toBe(true);
    expect(upstream.properties).toEqual({});
  });
  it('falls back to provider discovery, retains schemas, and uses the documented default when unavailable', async () => {
    const schema = { Schema: { title: 'db' } };
    const { client } = harness(({ path }) => {
      if (path.includes('/resourceTypes/')) throw new Error('not served');
      if (path.includes('/providers?'))
        return {
          value: [
            {
              name: 'Applications.Core',
              resourceTypes: {
                applications: { apiVersions: { preview: schema } },
              },
            },
          ],
        };
      throw new Error('unexpected request');
    });
    expect(
      await client.getResourceType({
        namespace: 'Applications.Core',
        typeName: 'applications',
      }),
    ).toEqual({
      Name: 'Applications.Core/applications',
      Description:
        'This is the applications resource type from the Applications.Core provider. It allows you to define and manage applications resources within your Radius applications.',
      ResourceProviderNamespace: 'Applications.Core',
      APIVersions: { preview: schema },
      APIVersionList: ['preview'],
    });
    const fallback = harness(({ path }) => {
      if (path.includes('/resourceTypes/') || path.includes('/providers?'))
        throw new Error('discovery unavailable');
      return resource();
    });
    await fallback.client.getResourceById({ id: id() });
    expect(fallback.calls.at(-1)?.path).toBe(
      `${prefix}${id()}?api-version=2023-10-01-preview`,
    );
  });
  it('rejects missing types and malformed provider results explicitly', async () => {
    const missing = harness(({ path }) =>
      path.includes('/resourceTypes/')
        ? Promise.reject(new Error('not served'))
        : { value: [] },
    );
    await expect(
      missing.client.getResourceType({
        namespace: 'Other',
        typeName: 'missing',
      }),
    ).rejects.toThrow('Resource type Other/missing not found');
    for (const payload of [null, {}, { value: [null] }]) {
      const { client } = harness(() => payload);
      await expect(client.listResourceTypes()).rejects.toThrow(TypeError);
    }
    const empty = harness(() => ({
      value: [{ name: 'ns', resourceTypes: {} }],
    }));
    expect(await empty.client.listResourceTypes()).toEqual({ value: [] });
  });
  it('returns all namespaces and version keys without interpreting schemas', async () => {
    const { client } = harness(() => ({
      value: [
        {
          name: 'Applications.Core',
          resourceTypes: {
            applications: { apiVersions: { first: {}, second: {} } },
            empty: { apiVersions: {} },
          },
        },
        {
          name: 'Other',
          resourceTypes: { widgets: { apiVersions: { custom: {} } } },
        },
      ],
    }));
    const result = await client.listResourceTypes();
    expect(result.value.map(item => item.id)).toEqual([
      'Applications.Core/applications',
      'Other/widgets',
    ]);
    expect(result.value[0]).toEqual({
      id: 'Applications.Core/applications',
      name: 'Applications.Core/applications',
      type: 'System.Resources/resourceTypes',
      systemData: {},
      properties: {
        namespace: 'Applications.Core',
        type: 'applications',
        apiVersion: 'first\nsecond',
        apiVersions: ['first', 'second'],
      },
    });
  });
  it.each(['Applications.Core/applications', 'Radius.Core/applications'])(
    'merges %s legacy-first with first exact ID winning and no detail fetches',
    async type => {
      const first = resource();
      const other = resource('Radius.Core/applications', 'other');
      const { client, calls } = harness(({ path }) => {
        if (path.includes('/resourceTypes/')) return discovery;
        if (path.includes('/providers/Applications.Core/applications?'))
          return { value: [first] };
        if (path.includes('/providers/Radius.Core/applications?'))
          return { value: [{ ...first, name: 'discard' }, other] };
        throw new Error('unexpected request');
      });
      expect(
        await client.listResources({
          resourceType: type,
          resourceGroup: 'test',
        }),
      ).toEqual({ value: [first, other], complete: true, errors: [] });
      expect(calls).toHaveLength(4);
    },
  );
  it('reports partial list errors and rejects all-failed lists with the first error', async () => {
    const failure = new Error('legacy failed');
    const { client } = harness(({ path }) => {
      if (path.includes('/resourceTypes/')) return discovery;
      if (path.includes('Applications.Core/applications?')) throw failure;
      return { value: [] };
    });
    expect(await client.listApplications()).toEqual({
      value: [],
      complete: false,
      errors: [
        {
          resourceType: 'Applications.Core/applications',
          resourceId: undefined,
          error: failure,
        },
      ],
    });
    const all = harness(({ path }) => {
      if (path.includes('/resourceTypes/')) return discovery;
      throw failure;
    });
    await expect(all.client.listApplications()).rejects.toBe(failure);
  });
  it('hydrates inventory, skips deployments, and fills missing environments without mutating responses', async () => {
    const app = resource('Applications.Core/applications', 'app', {
      environment: id('Applications.Core/environments', 'env'),
    });
    const web = resource('Applications.Core/containers', 'web', {
      application: app.id,
    });
    const { client, calls } = harness(({ path }) => {
      if (path.includes('/resourceTypes/')) return discovery;
      if (path.includes('/resourceGroups?'))
        return { value: [{ name: 'test' }] };
      if (path.includes('/resources?'))
        return {
          value: [
            { id: web.id, type: web.type },
            { id: 'skipped', type: 'Microsoft.Resources/deployments' },
          ],
        };
      if (path.startsWith(`${prefix}${web.id}?`)) return web;
      if (path.startsWith(`${prefix}${app.id}?`)) return app;
      throw new Error(`unexpected request ${path}`);
    });
    expect((await client.listResources()).value[0].properties).toEqual({
      application: app.id,
      environment: id('Applications.Core/environments', 'env'),
    });
    expect(web.properties).toEqual({ application: app.id });
    expect(calls.some(call => call.path.includes('skipped'))).toBe(false);
  });
  it('preserves raw graph objects, connections, self edges and extra fields in a body-free POST', async () => {
    const graph = {
      name: 'app',
      extra: true,
      resources: [
        { ...resource(), connections: [{ id: id(), direction: 'Inbound' }] },
      ],
    };
    const controller = new AbortController();
    const { client, calls } = harness(({ path }) =>
      path.includes('/resourceTypes/') ? discovery : graph,
    );
    expect(
      await client.getApplicationGraph({
        applicationId: id(),
        signal: controller.signal,
      }),
    ).toBe(graph);
    expect(calls.at(-1)).toEqual({
      ...context,
      method: 'POST',
      path: `${prefix}${id()}/getGraph?api-version=newer`,
      signal: controller.signal,
    });
    expect(calls.every(call => call.signal === controller.signal)).toBe(true);
  });
  it('propagates graph transport failure and rejects invalid graph context before I/O', async () => {
    const error = new Error('HTTP 403');
    const { client, calls } = harness(({ path }) => {
      if (path.includes('/resourceTypes/')) return discovery;
      throw error;
    });
    await expect(
      client.getApplicationGraph({ applicationId: id() }),
    ).rejects.toBe(error);
    calls.length = 0;
    for (const invalid of [
      id('Other/applications'),
      id().replace('/local/', '/other/'),
      `${id()}/children/nested`,
    ]) {
      await expect(
        client.getApplicationGraph({ applicationId: invalid }),
      ).rejects.toThrow(TypeError);
    }
    expect(calls).toEqual([]);
  });
  it.each([
    ['Radius.Core/applications', '2025-08-01-preview', true],
    ['radius.core/applications', '2025-08-01', true],
    ['Radius.Core/applications', '2026-01-01-preview', true],
    ['Radius.Core/applications', '2025-07-31-preview', false],
    ['Radius.Core/applications', 'newer', false],
    ['Applications.Core/applications', '2025-08-01-preview', false],
    ['Applications.Core/applications', '2025-01-01', false],
  ])(
    'requests inline icons only for supported %s %s',
    async (type, version, supported) => {
      const graph = {
        resources: [{ ...resource(type), iconHash: 'a'.repeat(64) }],
        icons: { ['a'.repeat(64)]: '<svg/>' },
      };
      const controller = new AbortController();
      const { client, calls } = harness(({ path }) =>
        path.includes('/resourceTypes/')
          ? { ...discovery, APIVersionList: [version] }
          : graph,
      );
      expect(
        await client.getApplicationGraph({
          applicationId: id(type),
          signal: controller.signal,
        }),
      ).toBe(graph);
      expect(calls.at(-1)).toEqual({
        ...context,
        method: 'POST',
        path: `${prefix}${id(type)}/getGraph?api-version=${version}`,
        signal: controller.signal,
        ...(supported ? { body: { includeIcons: true } } : {}),
      });
      expect(calls[0]).not.toHaveProperty('body');
    },
  );
  it('propagates pre-abort, discovery abort and queued cancellation without fallback calls', async () => {
    const before = new AbortController();
    before.abort(new Error('cancelled'));
    const blocked = harness(() => {
      throw new Error('must not call');
    });
    await expect(
      blocked.client.getResourceById({ id: id(), signal: before.signal }),
    ).rejects.toThrow('cancelled');
    expect(blocked.calls).toEqual([]);
    const during = new AbortController();
    const abort = harness(() => {
      during.abort(new Error('discovery cancelled'));
      return discovery;
    });
    await expect(
      abort.client.getApplicationGraph({
        applicationId: id(),
        signal: during.signal,
      }),
    ).rejects.toThrow('discovery cancelled');
    expect(abort.calls).toHaveLength(1);
    const entered = deferred();
    const release = deferred();
    const bounded = harness(async () => {
      entered.resolve();
      await release.promise;
      return discovery;
    }, 1);
    const first = bounded.client.getResourceType({
      namespace: 'Applications.Core',
      typeName: 'applications',
    });
    await entered.promise;
    const queuedController = new AbortController();
    const second = bounded.client.getResourceType({
      namespace: 'Applications.Core',
      typeName: 'applications',
      signal: queuedController.signal,
    });
    queuedController.abort(new Error('queued cancelled'));
    await expect(second).rejects.toThrow('queued cancelled');
    release.resolve();
    await first;
    expect(bounded.calls).toHaveLength(1);
  });
  it('bounds all requests including concurrent discovery and preserves deterministic list order', async () => {
    let active = 0;
    let peak = 0;
    const { client } = harness(async ({ path }) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      if (path.includes('/resourceTypes/')) return discovery;
      return { value: [] };
    }, 1);
    await Promise.all([client.listApplications(), client.listEnvironments()]);
    expect(peak).toBe(1);
  });
  it('validates request identity, path boundaries and concurrency', async () => {
    for (const concurrency of [0, -1, 1.5, 33, NaN])
      expect(() => harness(() => discovery, concurrency)).toThrow(RangeError);
    expect(() =>
      createRadiusQueryClient(
        { request: jest.fn() },
        { ...context, connectionId: '' },
      ),
    ).toThrow(TypeError);
    const { client, calls } = harness(() => discovery);
    await expect(client.getResourceById({ id: 'bad' })).rejects.toThrow(
      TypeError,
    );
    await expect(
      client.getResourceById({ id: id().replace('/local/', '/other/') }),
    ).rejects.toThrow(TypeError);
    for (const group of ['', '..', 'a/b', 'a?b', 'a b'])
      await expect(
        client.listResources({ resourceGroup: group }),
      ).rejects.toThrow(TypeError);
    await expect(
      client.listResources({ resourceType: 'bad' }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('uses the default for an empty discovered version list and preserves supplied descriptions', async () => {
    const unnamed = harness(() => ({ APIVersions: {}, APIVersionList: [] }));
    expect(
      (
        await unnamed.client.getResourceType({
          namespace: 'Other',
          typeName: 'widgets',
        })
      ).Name,
    ).toBe('widgets');
    const empty = {
      ...discovery,
      Description: 'Explicit description',
      APIVersionList: [],
    };
    const { client, calls } = harness(({ path }) =>
      path.includes('/resourceTypes/') ? empty : resource(),
    );
    expect(
      (
        await client.getResourceType({
          namespace: 'Applications.Core',
          typeName: 'applications',
        })
      ).Description,
    ).toBe('Explicit description');
    await client.getResourceById({ id: id() });
    expect(calls.at(-1)?.path).toContain('api-version=2023-10-01-preview');
  });

  it.each([
    null,
    {},
    { APIVersions: null },
    { APIVersions: { bad: null } },
    { APIVersions: { '': {} } },
    { APIVersions: {}, APIVersionList: [2] },
  ])(
    'falls back from malformed specific discovery %# without fabricating a schema',
    async payload => {
      const { client } = harness(({ path }) =>
        path.includes('/resourceTypes/')
          ? payload
          : {
              value: [
                {
                  name: 'Applications.Core',
                  resourceTypes: {
                    applications: { apiVersions: { preview: {} } },
                  },
                },
              ],
            },
      );
      expect(
        (
          await client.getResourceType({
            namespace: 'Applications.Core',
            typeName: 'applications',
          })
        ).APIVersions,
      ).toEqual({ preview: {} });
    },
  );

  it.each([null, { apiVersions: { bad: null } }])(
    'rejects malformed provider type definitions %#',
    async definition => {
      const { client } = harness(() => ({
        value: [{ name: 'ns', resourceTypes: { type: definition } }],
      }));
      await expect(client.listResourceTypes()).rejects.toThrow(TypeError);
    },
  );

  it('treats missing provider versions as empty, not a fabricated schema', async () => {
    const { client } = harness(({ path }) => {
      if (path.includes('/resourceTypes/')) throw new Error('not served');
      return { value: [{ name: 'Other', resourceTypes: { widgets: {} } }] };
    });

    expect(await client.listResourceTypes()).toEqual({ value: [] });
    expect(
      (
        await client.getResourceType({
          namespace: 'Other',
          typeName: 'widgets',
        })
      ).APIVersions,
    ).toEqual({});
  });

  it('preserves provider fallback full names and supplied descriptions', async () => {
    const { client } = harness(({ path }) => {
      if (path.includes('/resourceTypes/')) throw new Error('not served');
      return {
        value: [
          {
            name: 'Other',
            resourceTypes: {
              widgets: {
                description: 'Provider description',
                apiVersions: { preview: {} },
              },
            },
          },
        ],
      };
    });
    const type = await client.getResourceType({
      namespace: 'Other',
      typeName: 'widgets',
    });
    expect(type.Name).toBe('Other/widgets');
    expect(type.Description).toBe('Provider description');
  });

  it('propagates AbortError even without a signal through discovery and partial merges', async () => {
    const error = new Error('transport cancelled');
    error.name = 'AbortError';
    const { client, calls } = harness(() => {
      throw error;
    });
    await expect(client.getResourceById({ id: id() })).rejects.toBe(error);
    expect(calls).toHaveLength(1);
    await expect(client.listApplications()).rejects.toBe(error);
  });

  it.each([
    null,
    {},
    { value: null },
    { value: [null] },
    { value: [{ id: 'x', name: 'x', type: 'x', properties: null }] },
  ])('rejects malformed typed list responses %#', async payload => {
    const { client } = harness(({ path }) =>
      path.includes('/resourceTypes/') ? discovery : payload,
    );
    await expect(
      client.listResources({ resourceType: 'Other/widgets' }),
    ).rejects.toThrow(TypeError);
  });

  it('rejects mismatched response identity and failed environment fixup', async () => {
    const mismatch = harness(({ path }) =>
      path.includes('/resourceTypes/')
        ? discovery
        : resource('Applications.Core/applications', 'different'),
    );
    await expect(mismatch.client.getResourceById({ id: id() })).rejects.toThrow(
      'does not match',
    );
    const invalid = harness(({ path }) => {
      if (path.includes('/resourceTypes/')) return discovery;
      if (
        path.startsWith(
          `${prefix}${id('Applications.Core/containers', 'web')}?`,
        )
      )
        return resource('Applications.Core/containers', 'web', {
          application: id(),
        });
      return resource();
    });
    await expect(
      invalid.client.getResourceById({
        id: id('Applications.Core/containers', 'web'),
      }),
    ).rejects.toThrow('environment must be a string');
  });

  it.each([null, {}, { value: null }, { value: [null] }])(
    'rejects malformed resource group inventory %#',
    async payload => {
      const { client } = harness(() => payload);
      await expect(client.listResources()).rejects.toThrow(TypeError);
    },
  );

  it.each([null, {}, { value: [null] }, { value: [{ id: 'x' }] }])(
    'rejects malformed per-group inventory %#',
    async payload => {
      const { client } = harness(() => payload);
      await expect(
        client.listResources({ resourceGroup: 'test' }),
      ).rejects.toThrow(TypeError);
    },
  );

  it('retains group and resource partial failures, supports empty groups and does not discover unrequested groups', async () => {
    const groupError = new Error('group unavailable');
    const resourceError = new Error('resource unavailable');
    const good = resource('Other/widgets', 'good');
    const bad = resource('Other/widgets', 'bad');
    const { client } = harness(({ path }) => {
      if (path.includes('/resourceGroups?'))
        return { value: [{ name: 'good' }, { name: 'bad' }] };
      if (path.includes('/resourceGroups/bad/resources?')) throw groupError;
      if (path.includes('/resources?')) return { value: [good, bad] };
      if (path.includes('/resourceTypes/')) return discovery;
      if (path.startsWith(`${prefix}${bad.id}?`)) throw resourceError;
      if (path.startsWith(`${prefix}${good.id}?`)) return good;
      throw new Error('unexpected request');
    });
    const result = await client.listResources();
    expect(result.value).toEqual([good]);
    expect(result.complete).toBe(false);
    expect(result.errors.map(failure => failure.error)).toEqual([
      groupError,
      resourceError,
    ]);
    const empty = harness(() => ({ value: [] }));
    expect(await empty.client.listResources({ resourceGroup: 'test' })).toEqual(
      { value: [], complete: true, errors: [] },
    );
    expect(empty.calls).toHaveLength(1);
    expect(await empty.client.listResources()).toEqual({
      value: [],
      complete: true,
      errors: [],
    });
  });

  it.each([null, {}, { resources: null }])(
    'rejects malformed graph responses %#',
    async payload => {
      const { client } = harness(({ path }) =>
        path.includes('/resourceTypes/') ? discovery : payload,
      );
      await expect(
        client.getApplicationGraph({ applicationId: id() }),
      ).rejects.toThrow(TypeError);
    },
  );

  it('rejects nested type queries before I/O and snapshots the selected context', async () => {
    const selected = { ...context, plane: { ...context.plane } };
    const port: RadiusQueryPort = { request: jest.fn() };
    const client = createRadiusQueryClient(port, selected);
    selected.plane.name = 'changed';
    await expect(
      client.listResources({ resourceType: 'Other/widgets/children' }),
    ).rejects.toThrow(TypeError);
    expect(port.request).not.toHaveBeenCalled();
  });
});
