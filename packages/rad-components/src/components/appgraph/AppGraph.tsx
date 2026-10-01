import React, { useCallback, useState } from 'react';
import {
  ReactFlow,
  Edge,
  Node,
  useReactFlow,
  useNodesState,
  useEdgesState,
  useStore,
  ReactFlowProvider,
  Controls,
  ControlButton,
  Panel,
  getNodesBounds,
} from 'reactflow';
import Dagre, { NodeLabel } from '@dagrejs/dagre';
// Pinned to 1.11.11 in package.json: 1.11.12 and 1.11.13 leave React Flow's
// SVG edges out of the image, so the export would show only the nodes.
import { toPng } from 'html-to-image';
import { AppGraph as AppGraphData, Resource } from '../../graph';
import { ResourceNode } from '../resourcenode/index';

import 'reactflow/dist/style.css';
import { parseResourceId } from '../../resourceId';

const nodeTypes = { default: ResourceNode };

/** Blank space kept around the graph in an exported image, in pixels. */
const EXPORT_PADDING = 32;

/**
 * Renders every node and edge of the graph, not just the part currently in
 * view, to a PNG data URL at its natural size. The background is white so the
 * image reads the same wherever it is shared.
 */
export async function exportGraphToPng(
  viewport: HTMLElement,
  nodes: Node[],
): Promise<string> {
  const bounds = getNodesBounds(nodes);
  const width = Math.ceil(bounds.width + 2 * EXPORT_PADDING);
  const height = Math.ceil(bounds.height + 2 * EXPORT_PADDING);

  return toPng(viewport, {
    backgroundColor: '#ffffff',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${EXPORT_PADDING - bounds.x}px, ${
        EXPORT_PADDING - bounds.y
      }px) scale(1)`,
    },
  });
}

/** File name for an exported graph image, safe to use on any file system. */
export function graphImageFileName(graphName?: string): string {
  const base = (graphName ?? '').replace(/[^\w.-]+/g, '-') || 'application';
  return `${base}-graph.png`;
}

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

const LayoutFlow = (props: { graph: AppGraphData }) => {
  const initial = initialNodes(props.graph);
  const layoutedNodes = getLayoutedElements(initial.nodes, initial.edges, {
    direction: 'TB',
  });

  const { fitView, getNodes } = useReactFlow();
  const domNode = useStore(state => state.domNode);
  const [exportFailed, setExportFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const downloadImage = async () => {
    setExportFailed(false);
    setExporting(true);
    const viewport = domNode?.querySelector<HTMLElement>(
      '.react-flow__viewport',
    );
    try {
      if (!viewport) {
        throw new Error('The graph is not rendered.');
      }
      const link = document.createElement('a');
      link.href = await exportGraphToPng(viewport, getNodes());
      link.download = graphImageFileName(props.graph.name);
      link.click();
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  };
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
      <Controls showInteractive={false}>
        <ControlButton
          onClick={downloadImage}
          disabled={exporting || nodes.length === 0}
          title="Download graph as PNG"
          aria-label="Download graph as PNG"
        >
          <DownloadIcon />
        </ControlButton>
      </Controls>
      {exportFailed && (
        <Panel position="top-right" role="alert">
          The graph image could not be exported.
        </Panel>
      )}
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

export function initialNodes(graph: AppGraphData): {
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

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: { direction: string },
): { nodes: Node[]; edges: Edge[] } {
  // Built per call. A module-scoped graph accumulated every node and edge it
  // had ever been given, so a second render laid out against the union of all
  // previous graphs: stale nodes kept influencing positions and removed ones
  // were never dropped.
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
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
