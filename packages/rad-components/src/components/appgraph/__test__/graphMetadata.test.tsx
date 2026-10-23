import React from 'react';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { AppGraph as AppGraphData } from '../../../graph';
import { graphWithMetadata } from '../../../__fixtures__/graphWithMetadata';
import { buildLayoutedGraphModel } from '../../../graphModel';
import ResourceNode from '../../resourcenode/ResourceNode';
import { initialNodes } from '../AppGraph';

const loadGraph = (): AppGraphData =>
  JSON.parse(JSON.stringify(graphWithMetadata));

describe('graph metadata', () => {
  it('renders one directed edge per mirrored relationship with distinct kinds', () => {
    const { edges } = initialNodes(loadGraph());
    const [consumer, queue, database] = graphWithMetadata.resources;

    expect(edges).toHaveLength(2);
    expect(edges).toEqual([
      expect.objectContaining({
        source: queue.id,
        target: consumer.id,
        label: 'Connection',
        data: { kind: 'Connection' },
        style: undefined,
      }),
      expect.objectContaining({
        source: database.id,
        target: consumer.id,
        label: 'Dependency',
        data: { kind: 'Dependency' },
        style: { strokeDasharray: '5 5' },
      }),
    ]);
    expect(new Set(edges.map(edge => edge.id)).size).toBe(2);
    expect(buildLayoutedGraphModel(loadGraph()).edges).toHaveLength(2);
  });

  it.each([false, true])(
    'prefers Connection over Dependency in either entry order (reverse: %s)',
    reverse => {
      const graph = loadGraph();
      graph.resources[0].connections!.push({
        id: graph.resources[1].id,
        direction: 'Outbound',
        kind: 'Dependency',
      });
      if (reverse) {
        graph.resources.reverse();
        graph.resources.forEach(resource => resource.connections?.reverse());
      }

      const edges = initialNodes(graph).edges;
      expect(edges).toHaveLength(2);
      expect(edges.filter(edge => edge.label === 'Connection')).toHaveLength(1);
    },
  );

  it('accepts inbound-only entries without applying the legacy gateway correction', () => {
    const graph = loadGraph();
    const [consumer, queue] = graph.resources;
    consumer.id = consumer.id.replace(
      'Radius.Test/resources/consumer',
      'Radius.Core/gateways/edge',
    );
    consumer.connections = [];
    queue.connections = [
      {
        id: consumer.id,
        direction: 'Inbound',
        kind: 'Connection',
      },
    ];
    graph.resources = [consumer, queue];

    expect(initialNodes(graph).edges).toEqual([
      expect.objectContaining({ source: queue.id, target: consumer.id }),
    ]);
  });

  it('retains separate relationships in opposite directions', () => {
    const graph = loadGraph();
    graph.resources[1].connections!.push({
      id: graph.resources[0].id,
      direction: 'Outbound',
      kind: 'Dependency',
    });

    const edges = initialNodes(graph).edges;
    expect(edges).toHaveLength(3);
    expect(new Set(edges.map(edge => edge.id)).size).toBe(3);
  });

  it('keeps legacy untagged connections alongside tagged connections', () => {
    const graph = loadGraph();
    graph.resources[0].connections!.push({
      id: graph.resources[2].id,
      direction: 'Inbound',
    });

    expect(initialNodes(graph).edges).toHaveLength(3);
  });

  it('does not change the API response while building or laying out typed edges', () => {
    const graph = loadGraph();
    const before = JSON.stringify(graph);
    initialNodes(graph);
    buildLayoutedGraphModel(graph);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('resolves icon hashes from the shared icon map without treating SVG as HTML', () => {
    const graph = loadGraph();
    const { nodes } = initialNodes(graph);
    const { container } = render(
      <ReactFlowProvider>
        <ResourceNode data={nodes[0].data} />
      </ReactFlowProvider>,
    );
    const image = container.querySelector('img');

    expect(image).toHaveAttribute(
      'src',
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(graph.icons!.container!)}`,
    );
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('width', '32');
    expect(container.querySelector('svg')).toBeNull();
    expect(buildLayoutedGraphModel(graph).nodes[0].icon).toBe('container');
  });

  const missingIconMaps: AppGraphData['icons'][] = [
    undefined,
    {},
    { container: null },
  ];

  it.each(missingIconMaps)(
    'keeps labels and types when icon bytes are absent (%s)',
    icons => {
      const graph = { ...loadGraph(), icons };
      const { nodes } = initialNodes(graph);
      const { container, getByRole } = render(
        <ReactFlowProvider>
          <ResourceNode data={nodes[0].data} />
        </ReactFlowProvider>,
      );

      expect(container.querySelector('img')).toBeNull();
      expect(getByRole('heading', { name: 'consumer' })).toBeInTheDocument();
      expect(
        getByRole('heading', { name: 'Radius.Compute/containers' }),
      ).toBeInTheDocument();
    },
  );
});
