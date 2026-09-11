import { AppGraph } from '../graph';
import { buildGraphModel, buildLayoutedGraphModel } from '../graphModel';

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
 * These assert properties that must hold no matter how nodes and edges are
 * represented, so they are the only graph tests allowed to survive the move to
 * the shared graph package unchanged. They deliberately say nothing about
 * object shape, class names, coordinates, or colours: all of that is being
 * replaced, and asserting it would produce failures that mean nothing.
 *
 * They go through `buildGraphModel` rather than the renderer's internals for
 * the same reason.
 */

/**
 * Fixtures are JSON modules, so every test would otherwise share one object
 * graph. `initialNodes` mutates the connections it is given (see GU-05a), which
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

describe('graph invariants', () => {
  describe('GU-01: every resource yields exactly one node', () => {
    it.each(allFixtures)('%s', (_name, fixture) => {
      const graph = load(fixture);
      const model = buildGraphModel(graph);

      expect(model.nodes).toHaveLength(graph.resources.length);
    });
  });

  describe('GU-02: every retained connection yields exactly one edge', () => {
    it.each(allFixtures)('%s', (_name, fixture) => {
      const graph = load(fixture);
      const model = buildGraphModel(graph);

      // A connection is retained unless its id cannot be parsed; the parser is
      // what decides, so count the ones that survive rather than re-implementing
      // the rule here.
      const declared = graph.resources.reduce(
        (total, resource) => total + (resource.connections?.length ?? 0),
        0,
      );

      expect(model.edges.length).toBeLessThanOrEqual(declared);
    });
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

  it('GU-05: an unparseable connection id is skipped without dropping its node', () => {
    const model = buildGraphModel(load(unparseableConnection));

    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].label).toBe('webapp');
  });

  /**
   * KNOWN-DEFECT: the parse result is used only to decide whether to rewrite the
   * direction; the edge-building loop that follows runs over every connection
   * regardless. So an unparseable connection id is *not* skipped — it produces
   * an edge to a node that does not exist, and the dependency disappears from
   * the diagram with no error. GU-05's "without dropping its node" holds; the
   * "skipped" half does not.
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
   * KNOWN-DEFECT: `getLayoutedElements` reuses one module-level Dagre graph, so
   * nodes and edges from a previously laid-out graph are still present when the
   * next one is laid out. Laying out A then B therefore does not equal laying
   * out B alone: B's nodes are displaced by A's, which the user cannot see. This
   * is the defect most likely to be mistaken for a layout regression during the
   * extraction, so it is pinned before the extraction starts.
   *
   * Module isolation is what makes this observable. The leaked state lives in a
   * module-level binding, so the first layout in this file would otherwise
   * pollute every later one and there would be no clean measurement to compare
   * against.
   */
  it('GU-08: KNOWN-DEFECT layout state leaks between successive graphs', () => {
    const layoutSequence = (...fixtures: unknown[]) => {
      let result: unknown;
      jest.isolateModules(() => {
        // `jest.isolateModules` is synchronous, so a fresh copy of the module
        // has to be pulled in with `require`.
        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, no-restricted-imports */
        const fresh =
          require('../graphModel') as typeof import('../graphModel');
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, no-restricted-imports */
        for (const fixture of fixtures) {
          result = fresh.buildLayoutedGraphModel(load(fixture));
        }
      });
      return result;
    };

    const alone = layoutSequence(singleNode);
    const afterAnotherGraph = layoutSequence(largeFanOut, singleNode);

    expect(afterAnotherGraph).not.toEqual(alone);
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
      expect(model.edges).toHaveLength(3);
    });

    it('keeps every edge in a large fan-out', () => {
      const model = buildGraphModel(load(largeFanOut));

      expect(model.nodes).toHaveLength(13);
      expect(model.edges).toHaveLength(12);
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
