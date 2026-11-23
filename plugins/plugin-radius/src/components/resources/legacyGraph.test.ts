import {
  AppGraphData,
  Connection,
  Direction,
  legacyGraphToLive,
  ResourceData,
} from './legacyGraph';

const base = '/planes/radius/local/resourceGroups/g/providers';
const idOf = (type: string, name: string) => `${base}/${type}/${name}`;

const resource = (
  type: string,
  name: string,
  extra: Partial<ResourceData> = {},
): ResourceData => ({
  id: idOf(type, name),
  name,
  type,
  provider: 'kubernetes',
  provisioningState: 'Succeeded',
  ...extra,
});

const connection = (
  target: ResourceData,
  direction: Direction,
): Connection => ({
  id: target.id,
  name: target.name,
  type: target.type,
  provider: target.provider,
  direction,
});

const appId =
  '/planes/radius/local/resourceGroups/g/providers/Applications.Core/applications/app';
const context = {
  connectionId: 'cluster',
  plane: { type: 'radius', name: 'local' },
  applicationId: appId,
};

const live = (resources: ResourceData[], icons?: Record<string, unknown>) =>
  legacyGraphToLive(
    { name: 'app', resources, icons: icons as AppGraphData['icons'] },
    context,
  );

const edges = (graph: ReturnType<typeof live>) =>
  graph.resources.flatMap(r => r.connections.map(c => [r.id, c.id]));

describe('legacyGraphToLive', () => {
  const frontend = resource('Applications.Core/containers', 'frontend');
  const db = resource('Applications.Datastores/redisCaches', 'db');

  it('returns a live graph with the given context', () => {
    const graph = live([frontend]);

    expect(graph.kind).toBe('live');
    expect(graph.context).toEqual(context);
  });

  it('draws an Inbound connection from the owning resource to its target', () => {
    const owner = { ...frontend, connections: [connection(db, 'Inbound')] };

    expect(edges(live([owner, db]))).toEqual([[frontend.id, db.id]]);
  });

  it('draws an Outbound connection from the target to the owning resource', () => {
    const owner = { ...frontend, connections: [connection(db, 'Outbound')] };

    expect(edges(live([owner, db]))).toEqual([[db.id, frontend.id]]);
  });

  it.each(['Applications.Core/gateways', 'Radius.Compute/routes'])(
    'draws an Inbound connection to %s from the gateway',
    type => {
      const gateway = resource(type, 'gw');
      const owner = {
        ...frontend,
        connections: [connection(gateway, 'Inbound')],
      };

      expect(edges(live([owner, gateway]))).toEqual([
        [gateway.id, frontend.id],
      ]);
    },
  );

  it('uses the same direction when the other side reports the edge too', () => {
    const owner = { ...frontend, connections: [connection(db, 'Inbound')] };
    const target = { ...db, connections: [connection(frontend, 'Outbound')] };

    expect(edges(live([owner, target]))).toEqual([[frontend.id, db.id]]);
  });

  it('drops unresolved, self and repeated connections and reports them', () => {
    const missing = resource('Applications.Core/containers', 'missing');
    const owner = {
      ...frontend,
      connections: [
        { ...connection(db, 'Inbound'), id: 'not-an-id' },
        connection(missing, 'Inbound'),
        connection(frontend, 'Inbound'),
        connection(db, 'Inbound'),
        connection(db, 'Inbound'),
      ],
    };
    const graph = live([owner, db]);

    expect(edges(graph)).toEqual([[frontend.id, db.id]]);
    expect(graph.warnings?.map(w => w.code)).toEqual([
      'unresolved-connection',
      'unresolved-connection',
      'unresolved-connection',
    ]);
  });

  it('keeps the first of duplicate ids and skips entries without id or type', () => {
    const graph = live([
      frontend,
      { ...frontend, name: 'duplicate' },
      { ...db, id: '' },
      { ...db, type: '' },
    ]);

    expect(graph.resources.map(r => r.name)).toEqual(['frontend']);
    expect(graph.warnings).toContainEqual(
      expect.objectContaining({
        code: 'duplicate-resource',
        resourceId: frontend.id,
      }),
    );
  });

  it.each([false, true])(
    'reports duplicate IDs while retaining the first status and connections (conflict=%s)',
    conflict => {
      const owner = { ...frontend, connections: [connection(db, 'Inbound')] };
      const duplicate = conflict
        ? { ...frontend, provisioningState: 'Failed' }
        : owner;
      const graph = live([owner, duplicate, db]);
      expect(
        graph.resources.find(r => r.id === owner.id)?.provisioningState,
      ).toBe('Succeeded');
      expect(edges(graph)).toEqual([[owner.id, db.id]]);
      expect(graph.warnings).toContainEqual(
        expect.objectContaining({
          code: 'duplicate-resource',
          resourceId: owner.id,
        }),
      );
    },
  );

  it.each([42, null, undefined])(
    'retains usable topology with a malformed connection ID %j',
    invalidId => {
      const graph = live(
        JSON.parse(
          JSON.stringify([
            {
              ...frontend,
              connections: [
                { ...connection(db, 'Inbound'), id: invalidId },
                connection(db, 'Inbound'),
              ],
            },
            db,
          ]),
        ),
      );
      expect(edges(graph)).toEqual([[frontend.id, db.id]]);
      expect(graph.warnings.length).toBeGreaterThan(0);
    },
  );
  it('falls back to the id name when a resource has no name', () => {
    const [mapped] = live([{ ...frontend, name: '' }]).resources;

    expect(mapped.name).toBe('frontend');
  });

  it('returns an empty graph for an empty payload', () => {
    expect(live([]).resources).toEqual([]);
  });

  it.each(['Succeeded', 'Failed', 'Canceled', 'Updating', 'CustomPending'])(
    'keeps the raw provisioning state %j',
    state => {
      const [mapped] = live([
        { ...frontend, provisioningState: state },
      ]).resources;

      expect(mapped.provisioningState).toBe(state);
    },
  );

  describe('icons', () => {
    const hash = 'b'.repeat(64);
    const svg = '<svg></svg>';

    it('resolves the icon for a valid hash', () => {
      const [mapped] = live([{ ...frontend, iconHash: hash }], {
        [hash]: svg,
      }).resources;

      expect(mapped.icon).toBe(svg);
    });

    it.each([
      ['a malformed hash', { iconHash: 'abc' }, { abc: svg }],
      ['an unknown hash', { iconHash: hash }, { ['c'.repeat(64)]: svg }],
      ['a non-svg value', { iconHash: hash }, { [hash]: '<img src=x>' }],
      ['a non-string value', { iconHash: hash }, { [hash]: 1 }],
    ])('leaves the icon unset and warns for %s', (_label, extra, icons) => {
      const graph = live([{ ...frontend, ...extra }], icons);

      expect(graph.resources[0].icon).toBeUndefined();
      expect(graph.warnings?.map(w => w.code)).toEqual(['invalid-icon']);
    });

    it('leaves the icon unset without a warning when the payload has no icon map', () => {
      const graph = live([{ ...frontend, iconHash: hash }], undefined);

      expect(graph.resources[0].icon).toBeUndefined();
      expect(graph.warnings ?? []).toEqual([]);
    });

    it('leaves the icon unset without a warning when there is no hash', () => {
      const graph = live([frontend], { [hash]: svg });

      expect(graph.resources[0].icon).toBeUndefined();
      expect(graph.warnings ?? []).toEqual([]);
    });
  });
});
