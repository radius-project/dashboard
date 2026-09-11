import { AppGraph } from './graph';
import {
  initialNodes,
  getLayoutedElements,
} from './components/appgraph/AppGraph';

export interface GraphModelNode {
  id: string;
  label: string;
  type: string;
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
    nodes: nodes.map(node => ({
      id: node.id,
      label: node.data.name,
      type: node.data.type,
      status: node.data.provisioningState,
      position: node.position,
    })),
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
    nodes: layouted.nodes.map(node => ({
      id: node.id,
      label: (node.data as { name: string }).name,
      type: (node.data as { type: string }).type,
      status: (node.data as { provisioningState: string }).provisioningState,
      position: node.position,
    })),
    edges: layouted.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    })),
  };
}
