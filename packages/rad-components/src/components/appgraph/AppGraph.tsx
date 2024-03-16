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
import Dagre, { Label } from '@dagrejs/dagre';
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
    direction => {
      const layouted = getLayoutedElements(nodes, edges, { direction });

      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);

      window.requestAnimationFrame(() => {
        fitView();
      });
    },
    [nodes, edges],
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

function initialNodes(graph: AppGraphData): {
  nodes: Node<Resource>[];
  edges: Edge[];
} {
  const nodes: Node<Resource>[] = [];
  const edges: Edge[] = [];

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
  nodes.forEach(node => g.setNode(node.id, node as Label));

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
