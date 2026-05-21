import React, { useCallback } from 'react';
import {
  ReactFlow,
  Edge,
  Node,
  useReactFlow,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Controls,
} from 'reactflow';
import Dagre, { NodeLabel } from '@dagrejs/dagre';
import { AppGraph as AppGraphData, Resource } from '../../graph';
import { ResourceNode } from '../resourcenode/index';

import 'reactflow/dist/style.css';
import { parseResourceId } from '../../resourceId';

const nodeTypes = { default: ResourceNode };

const LayoutFlow = (props: { graph: AppGraphData }) => {
  const initial = initialNodes(props.graph);
  const layoutedNodes = getLayoutedElements(initial.nodes, initial.edges, {
    direction: 'TB',
  });

  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedNodes.edges);

  useCallback(
    (direction: string) => {
      const layouted = getLayoutedElements(nodes, edges, { direction });

      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);

      window.requestAnimationFrame(() => {
        fitView();
      });
    },
    [nodes, edges, setNodes, setEdges, fitView],
  );

  // Notes on our usage of ReactFlow:
  //
  // - We're using an uncontrolled flow: https://reactflow.dev/learn/advanced-use/uncontrolled-flow
  // - We implemented a custom node type: https://reactflow.dev/learn/customization/custom-nodes
  // - We're using Dagre for layout: https://reactflow.dev/learn/layouting/layouting#dagre

  return (
    <ReactFlow
      defaultNodes={nodes}
      defaultEdges={edges}
      defaultEdgeOptions={{ type: 'bezier', animated: true }}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
    >
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};

export type AppGraphProps = { graph: AppGraphData };

function AppGraph(props: AppGraphProps) {
  return (
    <div {...props} style={{ height: '100%', width: '100%' }}>
      <ReactFlowProvider>
        <LayoutFlow graph={props.graph} />
      </ReactFlowProvider>
    </div>
  );
}

// Properties to skip when scanning for property-based resource references,
// since they either reference the containing application/environment (which
// adds no useful graph information) or are not resource identifiers.
const SKIP_PROPERTY_KEYS = new Set([
  'application',
  'environment',
  'provisioningState',
  'status',
]);

// Recursively scans a properties object for string values that match the ID
// or name of another resource in the graph and records the target IDs.
function collectPropertyRefs(
  obj: Record<string, unknown>,
  resourceById: Map<string, Resource>,
  resourceByName: Map<string, Resource>,
  selfId: string,
  seen: Set<string>,
  results: Set<string>,
  depth: number = 0,
): void {
  if (depth > 5) return;
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_PROPERTY_KEYS.has(key)) continue;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      const byId = resourceById.get(lower);
      if (byId && byId.id !== selfId && !seen.has(byId.id)) {
        results.add(byId.id);
      }
      const byName = resourceByName.get(lower);
      if (byName && byName.id !== selfId && !seen.has(byName.id)) {
        results.add(byName.id);
      }
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      collectPropertyRefs(
        value as Record<string, unknown>,
        resourceById,
        resourceByName,
        selfId,
        seen,
        results,
        depth + 1,
      );
    }
  }
}

function initialNodes(graph: AppGraphData): {
  nodes: Node<Resource>[];
  edges: Edge[];
} {
  const nodes: Node<Resource>[] = [];
  const edges: Edge[] = [];

  // Build lookup maps for all resources so we can detect property-based references.
  const resourceById = new Map<string, Resource>();
  const resourceByName = new Map<string, Resource>();
  for (const resource of graph.resources) {
    resourceById.set(resource.id.toLowerCase(), resource);
    resourceByName.set(resource.name.toLowerCase(), resource);
  }

  // Very simple layout scheme here for nodes.
  const orderData: { [order: number]: number } = {};

  for (const resource of graph.resources) {
    // The computed 'Order' is used to compute the 'y' coordinate for the initial layout.
    // This is computed based on the number of inbound connections (or whether it's a container).
    const order =
      resource.connections?.filter(c => c.direction === 'Inbound').length ||
      resource.type === 'Applications.Core/containers'
        ? 0
        : 3;

    // The computed 'Rank' is used to compute the 'x' coordinate for the initial layout.
    // This is computed based on the number of resources at the same 'Order'.
    const rank = (orderData[order] = (orderData[order] || 0) + 1);

    // This provides the initial bias for the layout. Dagre will adjust this.

    nodes.push({
      id: resource.id,
      position: { x: rank * 50, y: order * 50 },
      height: 250,
      width: 175,
      data: resource,
      type: 'default',
    });

    if (resource.connections) {
      for (const connection of resource.connections) {
        // We have a bug where the connections have the wrong direction.
        const parsedConnection = parseResourceId(connection.id);
        if (!parsedConnection) {
          continue;
        }

        if (
          connection.direction === 'Inbound' &&
          parsedConnection.type === 'Applications.Core/gateways'
        ) {
          connection.direction = 'Outbound';
        }
      }

      for (const connection of resource.connections) {
        if (connection.direction === 'Inbound') {
          edges.push({
            id: `${connection.id}-${resource.id}`,
            source: resource.id,
            target: connection.id,
          });
        } else {
          edges.push({
            id: `${resource.id}-${connection.id}`,
            source: connection.id,
            target: resource.id,
          });
        }
      }
    }

    // Also create edges for resources referenced via properties (not explicit
    // connections). These are shown with a dashed line to distinguish them from
    // proper connections.
    if (resource.properties) {
      const existingConnectionIds = new Set(
        (resource.connections || []).map(c => c.id.toLowerCase()),
      );
      const propertyRefs = new Set<string>();
      collectPropertyRefs(
        resource.properties,
        resourceById,
        resourceByName,
        resource.id,
        existingConnectionIds,
        propertyRefs,
      );
      for (const targetId of propertyRefs) {
        edges.push({
          id: `${resource.id}-prop-${targetId}`,
          source: resource.id,
          target: targetId,
          style: { strokeDasharray: '5,5' },
        });
      }
    }
  }

  return { nodes, edges };
}

const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: { direction: string },
) {
  g.setGraph({ rankdir: options.direction });

  edges.forEach(edge => g.setEdge(edge.source, edge.target));
  nodes.forEach(node => g.setNode(node.id, node as NodeLabel));

  Dagre.layout(g);

  return {
    nodes: nodes.map(node => {
      const { x, y } = g.node(node.id);

      return { ...node, position: { x, y } };
    }),
    edges,
  };
}

export default AppGraph;
