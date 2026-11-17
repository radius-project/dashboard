import React, { useEffect, useMemo } from 'react';
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
  const initial = useMemo(() => initialNodes(props.graph), [props.graph]);
  const layoutedNodes = useMemo(
    () =>
      getLayoutedElements(initial.nodes, initial.edges, { direction: 'TB' }),
    [initial],
  );

  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedNodes.edges);

  useEffect(() => {
    setNodes(layoutedNodes.nodes);
    setEdges(layoutedNodes.edges);
    const frame = window.requestAnimationFrame(() => fitView());
    return () => window.cancelAnimationFrame(frame);
  }, [layoutedNodes, setNodes, setEdges, fitView]);

  const warnings = [
    ...initial.warnings,
    ...(layoutedNodes.error ? [layoutedNodes.error] : []),
  ];

  return (
    <>
      {warnings.length > 0 && (
        <div role="status">
          {warnings.map((warning, index) => (
            <div key={`${index}-${warning}`}>{warning}</div>
          ))}
        </div>
      )}
      {initial.nodes.length === 0 ? (
        <div role="status">No resources in this application.</div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          defaultEdgeOptions={{ type: 'bezier', animated: true }}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      )}
    </>
  );
};

export type AppGraphProps = { graph: AppGraphData };

function AppGraph(props: AppGraphProps) {
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlowProvider>
        <LayoutFlow graph={props.graph} />
      </ReactFlowProvider>
    </div>
  );
}

// Built-in Radius types that get special handling. Both the legacy and the current
// namespaces are listed so that user-defined types with the same name do not match.
const CONTAINER_TYPES = new Set([
  'applications.core/containers',
  'radius.compute/containers',
]);
// Radius.Compute/routes replaces Applications.Core/gateways for ingress.
const GATEWAY_TYPES = new Set([
  'applications.core/gateways',
  'radius.compute/routes',
]);

// Radius resource types are case-insensitive.
const isResourceType = (type: string, types: Set<string>) =>
  types.has(type.toLowerCase());

export function initialNodes(graph: AppGraphData): {
  nodes: Node<Resource>[];
  edges: Edge[];
  warnings: string[];
} {
  const nodes: Node<Resource>[] = [];
  const edges: Edge[] = [];
  const warnings: string[] = [];
  const resources = new Map<string, Resource>();
  const signatures = new Map<string, string>();
  for (const resource of graph.resources) {
    const signature = JSON.stringify([
      resource.name,
      resource.type,
      resource.provider,
      resource.provisioningState,
      resource.connections ?? [],
    ]);
    if (resources.has(resource.id)) {
      warnings.push(
        signatures.get(resource.id) === signature
          ? `Duplicate resource ignored: ${resource.id}`
          : `Conflicting duplicate resource ignored: ${resource.id}`,
      );
      continue;
    }
    resources.set(resource.id, resource);
    signatures.set(resource.id, signature);
  }
  const edgeIds = new Set<string>();

  // Very simple layout scheme here for nodes.
  const orderData: { [order: number]: number } = {};

  for (const resource of resources.values()) {
    // The computed 'Order' is used to compute the 'y' coordinate for the initial layout.
    // This is computed based on the number of inbound connections (or whether it's a container).
    const order =
      resource.connections?.filter(c => c.direction === 'Inbound').length ||
      isResourceType(resource.type, CONTAINER_TYPES)
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

    for (const connection of resource.connections ?? []) {
      const parsedConnection = parseResourceId(connection.id);
      if (
        !parsedConnection ||
        !resources.has(connection.id) ||
        connection.id === resource.id
      ) {
        warnings.push(
          `Unresolved or self connection ignored: ${resource.id} -> ${connection.id}`,
        );
        continue;
      }
      const ownerIsSource =
        connection.direction === 'Inbound' &&
        !isResourceType(parsedConnection.type, GATEWAY_TYPES);
      const source = ownerIsSource ? resource.id : connection.id;
      const target = ownerIsSource ? connection.id : resource.id;
      const id = JSON.stringify([source, target]);
      if (!edgeIds.has(id)) {
        edgeIds.add(id);
        edges.push({ id, source, target });
      }
    }
  }

  return { nodes, edges, warnings };
}

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: { direction: string },
): { nodes: Node[]; edges: Edge[]; error?: string } {
  // Built per call. A module-scoped graph accumulated every node and edge it
  // had ever been given, so a second render laid out against the union of all
  // previous graphs: stale nodes kept influencing positions and removed ones
  // were never dropped.
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: options.direction });

  edges.forEach(edge => g.setEdge(edge.source, edge.target));
  nodes.forEach(node => g.setNode(node.id, node as NodeLabel));

  try {
    Dagre.layout(g);
    return {
      nodes: nodes.map(node => {
        const { x, y } = g.node(node.id);
        return { ...node, position: { x, y } };
      }),
      edges,
    };
  } catch (error) {
    return {
      nodes,
      edges,
      error: `Graph layout failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export default AppGraph;
