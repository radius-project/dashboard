import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Dagre from '@dagrejs/dagre';
import AppGraph, { initialNodes } from '../AppGraph';
import { AppGraph as AppGraphData, Direction } from '../../../graph';
import * as sampledata from '../../../sampledata';

describe.each(['Applications.Core', 'Radius.Core'])(
  '%s graph types',
  namespace => {
    const id = (type: string, name: string) =>
      `/planes/radius/local/resourceGroups/demo/providers/${namespace}/${type}/${name}`;
    const resource = (type: string, name: string) => ({
      id: id(type, name),
      name,
      type: `${namespace}/${type}`,
      provider: 'radius',
      provisioningState: 'Succeeded',
    });

    it('places containers without inbound connections in the leading row', () => {
      const graph: AppGraphData = {
        name: 'layout',
        resources: [
          resource('containers', 'webapp'),
          resource('gateways', 'edge'),
        ],
      };

      const { nodes } = initialNodes(graph);

      expect(nodes[0].position).toEqual({ x: 50, y: 0 });
      expect(nodes[1].position).toEqual({ x: 50, y: 150 });
    });

    it.each([
      ['gateways', 'Inbound', true],
      ['gateways', 'Outbound', true],
      ['containers', 'Inbound', false],
      ['mygateways', 'Inbound', false],
    ] as const)(
      'orients a %s %s connection without matching other types',
      (type, direction: Direction, dependencyIsSource) => {
        const owner = resource('containers', 'webapp');
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
  },
);

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

  /**
   * KNOWN-DEFECT: layout failures escape the renderer rather than producing a
   * degraded graph with an explanation. Tracked by #368.
   */
  it('GU-17: KNOWN-DEFECT propagates a graph layout failure', () => {
    jest.spyOn(Dagre, 'layout').mockImplementation(() => {
      throw new Error('layout failed');
    });

    expect(() =>
      render(<AppGraph graph={sampledata.DemoApplication} />),
    ).toThrow('layout failed');
  });
});
