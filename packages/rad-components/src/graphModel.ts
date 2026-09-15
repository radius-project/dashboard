import { AppGraph } from './graph';
import {
  initialNodes,
  getLayoutedElements,
} from './components/appgraph/AppGraph';
import {
  getResourceNodeSemantics,
  ResourceNodeSemantics,
} from './components/resourcenode';

export interface GraphModelNode extends ResourceNodeSemantics {
  id: string;
  status: string;
  position: { x: number; y: number };
}

export interface GraphModelEdge {
  id: string;
  source: string;
  target: string;
}

export interface GraphModel {
  nodes: GraphModelNode[];
  edges: GraphModelEdge[];
}

/**
 * The stable seam the Tier A graph invariants are written against.
 *
 * Those invariants must survive the move to the shared graph package, so they
 * must not name the dashboard's current internals. This adapter is the only
 * place that does: today it calls `initialNodes`, and after extraction it calls
 * the shared package instead. If the invariant tests had imported
 * `initialNodes` directly, every one of them would have had to be rewritten
 * during the extraction they exist to police.
 */
export function buildGraphModel(graph: AppGraph): GraphModel {
  const { nodes, edges } = initialNodes(graph);

  return {
    nodes: nodes.map(node => {
      const semantics = getResourceNodeSemantics(node.data);
      return {
        id: node.id,
        ...semantics,
        status: node.data.provisioningState,
        position: node.position,
      };
    }),
    edges: edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
}

/**
 * The same seam for the laid-out model, so that layout invariants (determinism,
 * independence between successive graphs, finite positions) can be asserted
 * without naming the layout engine.
 */
export function buildLayoutedGraphModel(graph: AppGraph): GraphModel {
  const { nodes, edges } = initialNodes(graph);
  const layouted = getLayoutedElements(nodes, edges, { direction: 'TB' });

  return {
    nodes: layouted.nodes.map(node => {
      const data = node.data as Parameters<typeof getResourceNodeSemantics>[0];
      return {
        id: node.id,
        ...getResourceNodeSemantics(data),
        status: data.provisioningState,
        position: node.position,
      };
    }),
    edges: layouted.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
}
