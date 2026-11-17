import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Dagre from '@dagrejs/dagre';
import AppGraph, { initialNodes } from '../AppGraph';
import { AppGraph as AppGraphData, Direction } from '../../../graph';
import * as sampledata from '../../../sampledata';

const resource = (type: string, name: string) => ({
  id: `/planes/radius/local/resourceGroups/demo/providers/${type}/${name}`,
  name,
  type,
  provider: 'radius',
  provisioningState: 'Succeeded',
});

describe.each([
  ['Applications.Core/containers', 'Applications.Core/gateways'],
  ['Radius.Compute/containers', 'Radius.Compute/routes'],
])('%s and %s graph types', (containerType, gatewayType) => {
  it('places containers without inbound connections in the leading row', () => {
    const graph: AppGraphData = {
      name: 'layout',
      resources: [
        resource(containerType, 'webapp'),
        resource(gatewayType, 'edge'),
      ],
    };

    const { nodes } = initialNodes(graph);

    expect(nodes[0].position).toEqual({ x: 50, y: 0 });
    expect(nodes[1].position).toEqual({ x: 50, y: 150 });
  });

  it.each([
    [gatewayType, 'Inbound', true],
    [gatewayType, 'Outbound', true],
    [containerType, 'Inbound', false],
  ] as const)(
    'orients a %s %s connection',
    (type, direction: Direction, dependencyIsSource) => {
      const owner = resource(containerType, 'webapp');
      const dependency = resource(type, 'dependency');
      const graph: AppGraphData = {
        name: 'direction',
        resources: [
          {
            ...owner,
            connections: [{ ...dependency, direction }],
          },
          dependency,
        ],
      };

      const { edges } = initialNodes(graph);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({
        source: dependencyIsSource ? dependency.id : owner.id,
        target: dependencyIsSource ? owner.id : dependency.id,
      });
    },
  );
});

describe('user-defined graph types', () => {
  it.each([
    'Contoso.Net/gateways',
    'Contoso.Net/routes',
    'Radius.Networking/gateways',
    'Applications.Core/mygateways',
  ])('does not reverse an Inbound connection to %s', type => {
    const owner = resource('Radius.Compute/containers', 'webapp');
    const dependency = resource(type, 'dependency');
    const graph: AppGraphData = {
      name: 'direction',
      resources: [
        { ...owner, connections: [{ ...dependency, direction: 'Inbound' }] },
        dependency,
      ],
    };

    const { edges } = initialNodes(graph);

    expect(edges).toEqual([
      expect.objectContaining({ source: owner.id, target: dependency.id }),
    ]);
  });

  it.each(['Contoso.Net/containers', 'Radius.Networking/containers'])(
    'does not lead the layout with %s',
    type => {
      const { nodes } = initialNodes({
        name: 'layout',
        resources: [resource(type, 'worker')],
      });

      expect(nodes[0].position).toEqual({ x: 50, y: 150 });
    },
  );

  it('matches built-in types without regard to letter case', () => {
    const owner = resource('radius.compute/containers', 'webapp');
    const dependency = resource('radius.compute/routes', 'edge');
    const { nodes, edges } = initialNodes({
      name: 'case',
      resources: [
        { ...owner, connections: [{ ...dependency, direction: 'Inbound' }] },
        dependency,
      ],
    });

    expect(nodes[1].position).toEqual({ x: 50, y: 150 });
    expect(edges).toEqual([
      expect.objectContaining({ source: dependency.id, target: owner.id }),
    ]);

    const lone = initialNodes({
      name: 'case',
      resources: [resource('RADIUS.COMPUTE/CONTAINERS', 'lone')],
    });
    expect(lone.nodes[0].position).toEqual({ x: 50, y: 0 });
  });
});

describe('AppGraph component', () => {
  // GU-17 replaces Dagre.layout on the shared module object. Without this the
  // throwing implementation survives into every later test in this file.
  afterEach(() => jest.restoreAllMocks());

  it('AppGraph should render correctly', () => {
    const application = sampledata.DemoApplication;
    render(<AppGraph graph={application} />);

    // For now we just test that the ReactFlow attribution is present. This means
    // that the UI rendered.
    const name = screen.getByRole('link', { name: 'React Flow attribution' });
    expect(name).toBeInTheDocument();
  });

  it('GU-17: retains the graph and explains a layout failure', () => {
    jest.spyOn(Dagre, 'layout').mockImplementation(() => {
      throw new Error('layout failed');
    });

    render(<AppGraph graph={sampledata.DemoApplication} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Graph layout failed: layout failed',
    );
    expect(
      screen.getByRole('link', { name: 'React Flow attribution' }),
    ).toBeVisible();
  });

  it('GU-15: explains an empty graph', () => {
    render(<AppGraph graph={{ name: 'empty', resources: [] }} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'No resources in this application.',
    );
  });

  it('GU-10: replaces visible nodes when the graph changes', () => {
    const first = {
      name: 'first',
      resources: [resource('Applications.Core/containers', 'first')],
    };
    const second = {
      name: 'second',
      resources: [resource('Applications.Core/containers', 'second')],
    };
    const view = render(<AppGraph graph={first} />);
    expect(screen.getByText('first')).toBeVisible();
    view.rerender(<AppGraph graph={second} />);
    expect(screen.queryByText('first')).not.toBeInTheDocument();
    expect(screen.getByText('second')).toBeVisible();
  });

  it.each([false, true])(
    'retains the first duplicate and reports conflict=%s',
    conflict => {
      const first = resource('Applications.Core/containers', 'first');
      const duplicate = { ...first, name: conflict ? 'conflict' : first.name };
      render(
        <AppGraph
          graph={{ name: 'duplicates', resources: [first, duplicate] }}
        />,
      );
      expect(screen.getAllByText('first')).toHaveLength(1);
      expect(screen.queryByText('conflict')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        conflict
          ? 'Conflicting duplicate resource ignored:'
          : 'Duplicate resource ignored:',
      );
    },
  );

  it('coalesces repeated directed connections without changing input', () => {
    const first = resource('Applications.Core/containers', 'first');
    const second = resource('Applications.Core/containers', 'second');
    const connection = { ...second, direction: 'Outbound' as const };
    const graph: AppGraphData = {
      name: 'repeated',
      resources: [{ ...first, connections: [connection, connection] }, second],
    };
    expect(initialNodes(graph).edges).toHaveLength(1);
    expect(graph.resources[0].connections).toHaveLength(2);
  });
});
