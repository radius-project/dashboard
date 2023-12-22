import React from "react";
import { AppGraph as AppGraphData, Resource } from "../../graph";
import ResourceNode from "../resourcenode/ResourceNode";
import * as d3 from "d3";

export type AppGraphProps = {
  graph: AppGraphData,
};

const AppGraph: React.FC<AppGraphProps> = ({
  graph,
  ...props
}) => {
  const itemSize = { width: 150, height: 150 };
  const layout = computeLayout(graph, { height: 500, width: 500, radius: 150 });
  return (
    <div {...props} style={{ display: 'grid', gridTemplateRows: '[heading] 15% [body] 85%', height: 'auto', width: '100%' }}>
      <h1 style={{ gridRow: 'heading', textAlign: 'center' }}>{graph.name}</h1>
      <svg style={{ gridRow: 'body', border: '1px solid', height: '100%', width: '100%', background: 'rgb(240, 247, 247)' }}>
        <defs>
          <marker
            id='arrowhead'
            orient="auto"
            markerWidth='3'
            markerHeight='4'
            refX='0.1'
            refY='2'>
            <path d='M0,0 V4 L2,2 Z' fill="black" />
          </marker>
        </defs>
        {layout.links.map((link) => (
          <line
            key={link.index}
            x1={bound({x: (link.target as ResourceNode).x!, y: (link.target as ResourceNode).y!}, link.source as ResourceNode, itemSize).x}
            y1={bound({x: (link.target as ResourceNode).x!, y: (link.target as ResourceNode).y!}, link.source as ResourceNode, itemSize).y}
            x2={bound({x: (link.source as ResourceNode).x!, y: (link.source as ResourceNode).y!}, link.target as ResourceNode, itemSize).x}
            y2={bound({x: (link.source as ResourceNode).x!, y: (link.source as ResourceNode).y!}, link.target as ResourceNode, itemSize).y}
            marker-end="url(#arrowhead)" 
            stroke="black"
            strokeWidth="1" />
        ))}
        {layout.nodes.map((node) => (
          <foreignObject
            key={node.resource.id}
            width={itemSize.width}
            height={itemSize.height}
            x={node.x}
            y={node.y}>
            <div style={{ background: 'rgb(255, 255, 255)', fontSize: '10px' }}>
              <ResourceNode key={node.resource.id} resource={node.resource} />
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
};

interface Point {
  x: number;
  y: number;
}

function bound(origin: Point, node: ResourceNode, size: { width: number, height: number }): Point {
 if (origin.y < node.y!) {
  // return bottom-center
  return { x: node.x! + size.width / 2, y: node.y! + size.height};
 } else {
  // return top-center
  return { x: node.x! + size.width / 2, y: node.y! }
 }
}

interface Layout {
  nodes: ResourceNode[];
  links: ResourceLink[];
}

interface ResourceNode extends d3.SimulationNodeDatum {
  resource: Resource;
}

interface ResourceLink extends d3.SimulationLinkDatum<ResourceNode> {
}

function computeLayout(graph: AppGraphData, config: { height: number, width: number, radius: number }): Layout {
  const nodes: ResourceNode[] = [];
  const links: ResourceLink[] = [];

  for (const resource of graph.resources) {
    nodes.push({ resource: resource });

    if (resource.connections) {
      for (const connection of resource.connections) {
        if (connection.direction === 'Inbound') {
          links.push({ source: connection.id, target: resource.id });
        } else {
          links.push({ source: resource.id, target: connection.id });
        }
      }
    }

  }

  // Based on: https://www.react-graph-gallery.com/network-chart
  const simulation = d3.forceSimulation(nodes) // apply the simulation to our array of nodes
    // Force #1: links between nodes
    .force('link', d3.forceLink(links).id((d) => (d as ResourceNode).resource.id))

    // Force #2: avoid node overlaps
    .force('collide', d3.forceCollide().radius(config.radius))

    // Force #3: attraction or repulsion between nodes
    .force('charge', d3.forceManyBody().strength(100))

    // Force #4: nodes are attracted by the center of the chart area
    .force('center', d3.forceCenter(config.width / 2, config.height / 2));

  simulation.tick(300);

  return { nodes, links };
}

export default AppGraph;