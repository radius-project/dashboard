import fs from 'fs';
import path from 'path';
import { normalizeLegacyLiveGraph } from '@radius-project/core/graph';

const directory = path.resolve(__dirname, '../__fixtures__/graph');
const fixtures: [string, unknown][] = fs
  .readdirSync(directory)
  .filter(file => file.endsWith('.json'))
  .map(file => [
    file.slice(0, -5),
    JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')),
  ]);
const fixture = (name: string) => fixtures.find(([key]) => key === name)![1];
const id = (suffix: string) =>
  `/planes/radius/local/resourceGroups/demo/providers/${suffix}`;
const relationships = (name: string) =>
  normalizeLegacyLiveGraph(fixture(name))
    .resources.flatMap(resource =>
      resource.connections.map(connection => [resource.id, connection.id]),
    )
    .map(pair => JSON.stringify(pair))
    .sort();

describe('Tier A public graph normalization invariants', () => {
  it.each(fixtures)(
    'GU-01/GU-03/GU-07: %s has unique identities, resolved edges and repeatable output',
    (_name, input) => {
      const graph = normalizeLegacyLiveGraph(input);
      const ids = new Set(graph.resources.map(resource => resource.id));
      expect(ids.size).toBe(graph.resources.length);
      for (const resource of graph.resources) {
        for (const connection of resource.connections) {
          expect(ids.has(connection.id)).toBe(true);
          expect(connection.id).not.toBe(resource.id);
        }
      }
      expect(normalizeLegacyLiveGraph(input)).toEqual(graph);
    },
  );

  it('GU-02 / GU-12 / GU-13: retains independent fixture-owned multi-tier topology', () => {
    expect(relationships('multi-tier')).toEqual(
      [
        [
          id('Applications.Core/gateways/edge'),
          id('Applications.Core/containers/frontend'),
        ],
        [
          id('Applications.Core/containers/backend'),
          id('Applications.Core/containers/frontend'),
        ],
        [
          id('Applications.Datastores/redisCaches/cache'),
          id('Applications.Core/containers/backend'),
        ],
      ]
        .map(pair => JSON.stringify(pair))
        .sort(),
    );
  });

  it('GU-02: retains the complete independent large-fan-out topology', () => {
    expect(relationships('large-fan-out')).toEqual(
      'abcdefghijkl'
        .split('')
        .map(suffix =>
          JSON.stringify([
            id(`Applications.Datastores/redisCaches/cache-${suffix}`),
            id('Applications.Core/containers/hub'),
          ]),
        )
        .sort(),
    );
  });

  it.each(['missing-target', 'unparseable-connection'])(
    'GU-04 / GU-05 / #353: %s omits invalid edges with diagnostics and preserves the owner',
    name => {
      const graph = normalizeLegacyLiveGraph(fixture(name));
      expect(graph.resources).toHaveLength(1);
      expect(graph.resources[0].name).toBe('webapp');
      expect(graph.resources[0].connections).toEqual([]);
      const warning = graph.warnings.find(
        entry => entry.code === 'unresolved-connection',
      );
      expect(warning).toMatchObject({ severity: 'warning' });
      expect(warning?.message).toContain(graph.resources[0].id);
      expect(warning?.message).toContain(
        name === 'missing-target'
          ? id('Applications.Datastores/redisCaches/absent')
          : 'not-a-resource-id',
      );
    },
  );

  it('GU-05b / #357: does not mutate gateway directions or the caller input', () => {
    const input = fixture('gateway-inbound');
    const before = JSON.stringify(input);
    normalizeLegacyLiveGraph(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('GU-06 / #357: removes self edges with a diagnostic without losing their node', () => {
    const graph = normalizeLegacyLiveGraph(fixture('self-reference'));
    expect(graph.resources).toHaveLength(1);
    expect(graph.resources[0].connections).toEqual([]);
    expect(
      graph.warnings.some(
        warning =>
          warning.code === 'unresolved-connection' &&
          warning.severity === 'warning',
      ),
    ).toBe(true);
  });

  it('GU-01 / #357: coalesces identical duplicate IDs with a diagnostic', () => {
    const graph = normalizeLegacyLiveGraph(fixture('duplicate-ids'));
    expect(graph.resources).toHaveLength(1);
    expect(
      graph.warnings.some(warning => warning.code === 'duplicate-resource'),
    ).toBe(true);
  });

  it('retains raw provisioning states, arbitrary types and both application namespaces', () => {
    expect(
      normalizeLegacyLiveGraph(fixture('deploy-status-matrix')).resources.map(
        resource => resource.provisioningState,
      ),
    ).toEqual(['Succeeded', 'Failed', 'Updating', 'Accepted']);
    expect(
      normalizeLegacyLiveGraph(fixture('unknown-type')).resources[0].type,
    ).toBe('Custom.Provider/widgets');
    expect(
      normalizeLegacyLiveGraph(fixture('both-namespaces'))
        .resources.map(resource => resource.type)
        .sort(),
    ).toEqual(['Applications.Core/containers', 'Radius.Core/containers']);
    expect(
      normalizeLegacyLiveGraph(fixture('managed-cluster')).resources,
    ).toHaveLength(1);
  });

  it('preserves explicit empty and single-resource topology', () => {
    expect(normalizeLegacyLiveGraph(fixture('empty')).resources).toEqual([]);
    const graph = normalizeLegacyLiveGraph(fixture('single-node'));
    expect(graph.resources).toHaveLength(1);
    expect(graph.resources[0].connections).toEqual([]);
  });
});
