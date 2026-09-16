import { AppGraph } from '../graph';
import {
  buildGraphModel,
  buildLayoutedGraphModel,
  GraphModel,
} from '../graphModel';

import empty from '../__fixtures__/graph/empty.json';
import singleNode from '../__fixtures__/graph/single-node.json';
import containerToDatabase from '../__fixtures__/graph/container-to-database.json';
import gatewayInbound from '../__fixtures__/graph/gateway-inbound.json';
import multiTier from '../__fixtures__/graph/multi-tier.json';
import unparseableConnection from '../__fixtures__/graph/unparseable-connection.json';
import missingTarget from '../__fixtures__/graph/missing-target.json';
import selfReference from '../__fixtures__/graph/self-reference.json';
import managedCluster from '../__fixtures__/graph/managed-cluster.json';
import deployStatusMatrix from '../__fixtures__/graph/deploy-status-matrix.json';
import unknownType from '../__fixtures__/graph/unknown-type.json';
import duplicateIds from '../__fixtures__/graph/duplicate-ids.json';
import bothNamespaces from '../__fixtures__/graph/both-namespaces.json';
import largeFanOut from '../__fixtures__/graph/large-fan-out.json';

/**
 * Tier A graph invariants.
 *
 * The correctness cases assert properties that must hold no matter how nodes and edges are
 * represented, so they are the only graph tests allowed to survive the move to
 * the shared graph package unchanged. They deliberately say nothing about
 * object shape, class names, coordinates, or colours: all of that is being
 * replaced, and asserting it would produce failures that mean nothing.
 *
 * They go through `buildGraphModel` rather than the renderer's internals for
 * the same reason. Cases labelled KNOWN-DEFECT are characterization pins, not
 * migration invariants: replace them with the desired assertion when the linked
 * defect is deliberately fixed.
 */

/**
 * Fixtures are JSON modules, so every test would otherwise share one object
 * graph. `initialNodes` mutates the connections it is given (see GU-05b), which
 * would leak across tests and make results depend on execution order. Cloning
 * per use is what keeps these tests independent.
 */
const load = (fixture: unknown): AppGraph =>
  JSON.parse(JSON.stringify(fixture)) as AppGraph;

const allFixtures: [string, unknown][] = [
  ['empty', empty],
  ['single-node', singleNode],
  ['container-to-database', containerToDatabase],
  ['gateway-inbound', gatewayInbound],
  ['multi-tier', multiTier],
  ['unparseable-connection', unparseableConnection],
  ['missing-target', missingTarget],
  ['self-reference', selfReference],
  ['managed-cluster', managedCluster],
  ['deploy-status-matrix', deployStatusMatrix],
  ['unknown-type', unknownType],
  ['duplicate-ids', duplicateIds],
  ['both-namespaces', bothNamespaces],
  ['large-fan-out', largeFanOut],
];

type Relationship = [source: string, target: string];

// Fixture-owned expectations, independent of the connection parser and builder.
// The common prefix is just fixture data; no relationship is inferred from output.
const fixtureId = (suffix: string) =>
  `/planes/radius/local/resourceGroups/demo/providers/${suffix}`;
const relationships = (...pairs: Relationship[]): Relationship[] =>
  pairs.map(([source, target]) => [fixtureId(source), fixtureId(target)]);

const expectedRelationships: Record<string, Relationship[]> = {
  empty: [],
  'single-node': [],
  'container-to-database': relationships([
    'Applications.Datastores/redisCaches/cache',
    'Applications.Core/containers/webapp',
  ]),
  'gateway-inbound': relationships([
    'Applications.Core/gateways/edge',
    'Applications.Core/containers/webapp',
  ]),
  'multi-tier': relationships(
    [
      'Applications.Core/gateways/edge',
      'Applications.Core/containers/frontend',
    ],
    [
      'Applications.Core/containers/backend',
      'Applications.Core/containers/frontend',
    ],
    [
      'Applications.Datastores/redisCaches/cache',
      'Applications.Core/containers/backend',
    ],
  ),
  'managed-cluster': [],
  'deploy-status-matrix': [],
  'unknown-type': [],
  'duplicate-ids': [],
  'both-namespaces': [],
  'large-fan-out': relationships(
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map(
      (suffix): Relationship => [
        `Applications.Datastores/redisCaches/cache-${suffix}`,
        'Applications.Core/containers/hub',
      ],
    ),
  ),
};

const defectConnectionFixtures = [
  'missing-target',
  'unparseable-connection',
  'self-reference',
];
const retainedConnectionFixtures = allFixtures.filter(
  ([name]) => !defectConnectionFixtures.includes(name),
);

const assertRelationships = (model: GraphModel, expected: Relationship[]) => {
  expect(model.edges).toHaveLength(expected.length);
  // Sorting retains multiplicity: replacing distinct edges with duplicates fails.
  expect(
    model.edges
      .map(({ source, target }) => JSON.stringify([source, target]))
      .sort(),
  ).toEqual(expected.map(pair => JSON.stringify(pair)).sort());
};

describe('graph invariants', () => {
  describe('GU-01: every resource yields exactly one node', () => {
    it.each(allFixtures)('%s', (_name, fixture) => {
      const graph = load(fixture);
      const model = buildGraphModel(graph);

      expect(model.nodes).toHaveLength(graph.resources.length);
    });
  });

  describe('GU-02: every retained connection yields exactly one edge', () => {
    // Invalid/self connections are defect pins below, not desired topology.
    it.each(retainedConnectionFixtures)('%s', (name, fixture) => {
      expect(expectedRelationships).toHaveProperty(name);
      assertRelationships(
        buildGraphModel(load(fixture)),
        expectedRelationships[name],
      );
    });
  });

  describe('GU-02a: topology assertions reject relationship corruption', () => {
    it.each(['redirected', 'reversed', 'missing', 'extra'] as const)(
      '%s edges',
      mutation => {
        const model = buildGraphModel(load(multiTier));
        const expected = expectedRelationships['multi-tier'];
        assertRelationships(model, expected);
        const first = model.edges[0];
        const edges = {
          redirected: model.edges.map(edge => ({
            ...edge,
            source: first.source,
            target: first.target,
          })),
          reversed: model.edges.map(edge => ({
            ...edge,
            source: edge.target,
            target: edge.source,
          })),
          missing: model.edges.slice(1),
          extra: [...model.edges, first],
        }[mutation];

        expect(() =>
          assertRelationships({ ...model, edges }, expected),
        ).toThrow();
      },
    );
  });

  describe('GU-03: every edge endpoint resolves to a node in the same graph', () => {
    // `missing-target` and `unparseable-connection` are excluded and covered by
    // GU-04 and GU-05a, which state the current behavior for endpoints that do
    // not resolve.
    const resolvable = allFixtures.filter(
      ([name]) =>
        name !== 'missing-target' && name !== 'unparseable-connection',
    );

    it.each(resolvable)('%s', (_name, fixture) => {
      const model = buildGraphModel(load(fixture));
      const ids = new Set(model.nodes.map(node => node.id));

      for (const edge of model.edges) {
        expect(ids.has(edge.source)).toBe(true);
        expect(ids.has(edge.target)).toBe(true);
      }
    });
  });

  /**
   * KNOWN-DEFECT: a connection whose target is not in the graph produces an
   * edge pointing at a node that does not exist. React Flow drops such an edge
   * silently, so a real dependency simply vanishes from the diagram with no
   * error anywhere. The requirement is that it is dropped or stubbed
   * deliberately; today it is neither.
   */
  it('GU-04: KNOWN-DEFECT a connection to an absent resource leaves a dangling edge', () => {
    const model = buildGraphModel(load(missingTarget));
    const ids = new Set(model.nodes.map(node => node.id));

    expect(model.edges).toHaveLength(1);
    expect(ids.has(model.edges[0].source)).toBe(false);
  });

  it('GU-05: an unparseable connection id does not drop its owning node', () => {
    const model = buildGraphModel(load(unparseableConnection));

    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].label).toBe('webapp');
  });

  /**
   * KNOWN-DEFECT: the parse result is used only to decide whether to rewrite the
   * direction; the edge-building loop that follows runs over every connection
   * regardless. So an unparseable connection id is *not* skipped — it produces
   * an edge to a node that does not exist, and the dependency disappears from
   * the diagram with no error. GU-05 protects the owning node; this test separately
   * pins the incorrect connection handling until it is fixed.
   */
  it('GU-05a: KNOWN-DEFECT an unparseable connection still produces a dangling edge', () => {
    const model = buildGraphModel(load(unparseableConnection));
    const ids = new Set(model.nodes.map(node => node.id));

    expect(model.edges).toHaveLength(1);
    expect(ids.has(model.edges[0].source)).toBe(false);
  });

  /**
   * KNOWN-DEFECT: `initialNodes` rewrites `connection.direction` in place, so it
   * mutates the caller's data. A caller that renders the same graph object
   * twice, or that holds it in React state, is silently handed different input
   * the second time. This is the input-side counterpart to the shared
   * module-level layout graph in GU-08.
   */
  it("GU-05b: KNOWN-DEFECT building the model mutates the caller's graph", () => {
    const graph = load(gatewayInbound);
    expect(graph.resources[0].connections?.[0].direction).toBe('Inbound');

    buildGraphModel(graph);

    expect(graph.resources[0].connections?.[0].direction).toBe('Outbound');
  });

  it('GU-06: a self-referential connection produces no duplicate node', () => {
    const model = buildGraphModel(load(selfReference));

    expect(model.nodes).toHaveLength(1);
  });

  /**
   * KNOWN-DEFECT: a self-referential connection produces a self-loop, which the
   * requirement says must not happen.
   */
  it('GU-06a: KNOWN-DEFECT a self-referential connection produces a self-loop', () => {
    const model = buildGraphModel(load(selfReference));

    expect(model.edges).toHaveLength(1);
    expect(model.edges[0].source).toBe(model.edges[0].target);
  });

  describe('GU-07: building the same fixture twice is deterministic', () => {
    it.each(allFixtures)('%s', (_name, fixture) => {
      expect(buildGraphModel(load(fixture))).toEqual(
        buildGraphModel(load(fixture)),
      );
    });
  });

  /**
   * `getLayoutedElements` used to reuse one module-level Dagre graph, so nodes
   * and edges from a previously laid-out graph were still present when the next
   * one was laid out: rendering A then B displaced B's nodes by A's, invisibly
   * to the user. The graph is now constructed per call, and this pins that.
   *
   * No module isolation is needed any more. That the plain sequence below holds
   * is itself the evidence there is no module-level state left to leak; the
   * previous version of this test could only observe the defect by reloading
   * the module between layouts.
   */
  it('GU-08: layout state does not leak between successive graphs', () => {
    const layoutSequence = (...fixtures: unknown[]) => {
      let result: unknown;
      for (const fixture of fixtures) {
        result = buildLayoutedGraphModel(load(fixture));
      }
      return result;
    };

    const alone = layoutSequence(singleNode);

    expect(layoutSequence(largeFanOut, singleNode)).toEqual(alone);
    expect(layoutSequence(singleNode, largeFanOut)).toEqual(
      layoutSequence(largeFanOut),
    );
  });

  describe('GU-09: every node receives a finite position', () => {
    it.each(allFixtures)('%s', (_name, fixture) => {
      const model = buildLayoutedGraphModel(load(fixture));

      for (const node of model.nodes) {
        expect(Number.isFinite(node.position.x)).toBe(true);
        expect(Number.isFinite(node.position.y)).toBe(true);
      }
    });
  });

  describe('GU-10: node and edge counts survive layout', () => {
    it.each(allFixtures)('%s', (_name, fixture) => {
      const model = buildGraphModel(load(fixture));
      const layouted = buildLayoutedGraphModel(load(fixture));

      expect(layouted.nodes).toHaveLength(model.nodes.length);
      expect(layouted.edges).toHaveLength(model.edges.length);
      expect(layouted.nodes.map(node => node.id).sort()).toEqual(
        model.nodes.map(node => node.id).sort(),
      );
      assertRelationships(
        layouted,
        model.edges.map(({ source, target }) => [source, target]),
      );
    });
  });

  describe('node identity and labelling', () => {
    it('preserves the resource name as the node label', () => {
      const model = buildGraphModel(load(containerToDatabase));

      expect(model.nodes.map(node => node.label).sort()).toEqual([
        'cache',
        'webapp',
      ]);
    });

    it('preserves provisioning state for every deploy status', () => {
      const model = buildGraphModel(load(deployStatusMatrix));

      expect(model.nodes.map(node => node.status)).toEqual([
        'Succeeded',
        'Failed',
        'Updating',
        'Accepted',
      ]);
    });

    it('renders both application namespaces as nodes', () => {
      const model = buildGraphModel(load(bothNamespaces));

      expect(model.nodes.map(node => node.type).sort()).toEqual([
        'Applications.Core/containers',
        'Radius.Core/containers',
      ]);
    });

    it('renders a resource whose type is unknown rather than dropping it', () => {
      const model = buildGraphModel(load(unknownType));

      expect(model.nodes).toHaveLength(1);
      expect(model.nodes[0].type).toBe('Custom.Provider/widgets');
    });

    it('does not promote managed child resources to top-level nodes', () => {
      const model = buildGraphModel(load(managedCluster));

      expect(model.nodes).toHaveLength(1);
      expect(model.nodes[0].label).toBe('webapp');
    });

    /**
     * KNOWN-DEFECT: two resources sharing an id produce two nodes with the same
     * id. React Flow requires unique node ids, so one silently wins.
     */
    it('KNOWN-DEFECT duplicate resource ids produce duplicate node ids', () => {
      const model = buildGraphModel(load(duplicateIds));
      const ids = new Set(model.nodes.map(node => node.id));

      expect(model.nodes).toHaveLength(2);
      expect(ids.size).toBe(1);
    });
  });

  describe('edge direction', () => {
    it('orients an outbound connection from the dependency to the dependent', () => {
      const model = buildGraphModel(load(containerToDatabase));

      expect(model.edges).toHaveLength(1);
      expect(model.edges[0].source).toContain('redisCaches/cache');
      expect(model.edges[0].target).toContain('containers/webapp');
    });

    /**
     * The gateway correction: an Inbound connection to a gateway is rewritten to
     * Outbound, so traffic is drawn flowing from the gateway into the container
     * rather than the reverse. It compensates for an upstream direction bug, so
     * it is expected to disappear during extraction — which is exactly why the
     * resulting orientation is pinned here first.
     */
    it('draws a gateway as the source, correcting the reported direction', () => {
      const model = buildGraphModel(load(gatewayInbound));

      expect(model.edges).toHaveLength(1);
      expect(model.edges[0].source).toContain('gateways/edge');
      expect(model.edges[0].target).toContain('containers/webapp');
    });

    it('keeps every edge in a multi-tier application', () => {
      const model = buildGraphModel(load(multiTier));

      expect(model.nodes).toHaveLength(4);
      assertRelationships(model, expectedRelationships['multi-tier']);
    });

    it('keeps every edge in a large fan-out', () => {
      const model = buildGraphModel(load(largeFanOut));

      expect(model.nodes).toHaveLength(13);
      assertRelationships(model, expectedRelationships['large-fan-out']);
    });
  });

  describe('degenerate inputs', () => {
    it('produces an empty model for an application with no resources', () => {
      expect(buildGraphModel(load(empty))).toEqual({ nodes: [], edges: [] });
    });

    it('produces a single node with no edges for a lone resource', () => {
      const model = buildGraphModel(load(singleNode));

      expect(model.nodes).toHaveLength(1);
      expect(model.edges).toHaveLength(0);
    });
  });
});
