import { useCallback } from "react";
import { ReactFlow, Edge, Node, useReactFlow, useNodesState, useEdgesState, ReactFlowProvider } from 'reactflow';
import Dagre, { Label } from '@dagrejs/dagre';
import { AppGraph as AppGraphData, Resource } from "../../graph";
import { ResourceNode } from "../resourcenode/index";

import 'reactflow/dist/style.css';

export type AppGraphProps = {
  graph: AppGraphData,
};

const nodeTypes = { default: ResourceNode };

const LayoutFlow = (props: AppGraphProps) => {
  const initial = initialNodes(props.graph);

  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  useCallback((direction) => {
    const layouted = getLayoutedElements(nodes, edges, { direction });

    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);

    window.requestAnimationFrame(() => {
      fitView();
    });
  }, [nodes, edges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
    />
  );
};

function AppGraph2(props: AppGraphProps) {
  return (
    <div {...props} style={{ height: 'auto', width: '100%' }}>
        <ReactFlowProvider>
          <LayoutFlow graph={props.graph} />
        </ReactFlowProvider>
    </div>
  );
};

function initialNodes(graph: AppGraphData): { nodes: Node<Resource>[], edges: Edge[] } {
  const nodes: Node<Resource>[] = [];
  const edges: Edge[] = [];

  let i = 0;
  for (const resource of graph.resources) {
    nodes.push({ id: resource.id, position: { x: 0, y: 200 * i++ }, data: resource, type: 'default', });

    if (resource.connections) {
      for (const connection of resource.connections) {
        if (connection.direction === 'Inbound') {
          edges.push({ id: `${connection.id}-${resource.id}`, type: 'smoothstep', source: connection.id, target: resource.id });
        } else {
          edges.push({ id: `${resource.id}-${connection.id}`, type: 'smoothstep', source: resource.id, target: connection.id });
        }
      }
    }
  }

  return { nodes, edges };
}

const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

function getLayoutedElements(nodes: Node[], edges: Edge[], options: { direction: string}) {
  g.setGraph({ rankdir: options.direction });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) => g.setNode(node.id, node as Label));

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id);

      return { ...node, position: { x, y } };
    }),
    edges,
  };
};

export default AppGraph2;