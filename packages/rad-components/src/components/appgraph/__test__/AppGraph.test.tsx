import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dagre from '@dagrejs/dagre';
import { toPng } from 'html-to-image';
import AppGraph, { exportGraphToPng, graphImageFileName } from '../AppGraph';
import * as sampledata from '../../../sampledata';

// Rasterising the DOM needs a real browser; the browser path is exercised in
// the dashboard. Here the boundary is mocked to check what is asked of it.
jest.mock('html-to-image', () => ({ toPng: jest.fn() }));
const mockToPng = toPng as jest.MockedFunction<typeof toPng>;

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

  describe('image export', () => {
    let clickedLinks: HTMLAnchorElement[];

    beforeEach(() => {
      mockToPng.mockReset();
      clickedLinks = [];
      jest
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function record(this: HTMLAnchorElement) {
          clickedLinks.push(this);
        });
    });

    it('offers a labelled download control next to the zoom controls', () => {
      render(<AppGraph graph={sampledata.DemoApplication} />);

      const button = screen.getByRole('button', {
        name: 'Download graph as PNG',
      });
      expect(button).toHaveAttribute('title', 'Download graph as PNG');
      expect(button.closest('.react-flow__controls')).not.toBeNull();
    });

    it('downloads a PNG of the graph viewport named after the application', async () => {
      mockToPng.mockResolvedValue('data:image/png;base64,AAAA');
      const { container } = render(
        <AppGraph graph={sampledata.DemoApplication} />,
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Download graph as PNG' }),
      );

      await waitFor(() => expect(clickedLinks).toHaveLength(1));
      expect(clickedLinks[0].download).toBe('demo-graph.png');
      expect(clickedLinks[0].href).toBe('data:image/png;base64,AAAA');
      expect(mockToPng).toHaveBeenCalledWith(
        container.querySelector('.react-flow__viewport'),
        expect.objectContaining({ backgroundColor: '#ffffff' }),
      );
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('reports a failed export and clears the report on a successful retry', async () => {
      mockToPng.mockRejectedValueOnce(new Error('canvas tainted'));
      mockToPng.mockResolvedValueOnce('data:image/png;base64,AAAA');
      render(<AppGraph graph={sampledata.DemoApplication} />);
      const button = screen.getByRole('button', {
        name: 'Download graph as PNG',
      });

      fireEvent.click(button);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The graph image could not be exported.',
      );
      expect(clickedLinks).toHaveLength(0);

      fireEvent.click(button);
      await waitFor(() => expect(clickedLinks).toHaveLength(1));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('disables the control while an export is running', async () => {
      let finish: (url: string) => void = () => {};
      mockToPng.mockReturnValue(
        new Promise<string>(resolve => {
          finish = resolve;
        }),
      );
      render(<AppGraph graph={sampledata.DemoApplication} />);
      const button = screen.getByRole('button', {
        name: 'Download graph as PNG',
      });

      fireEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      fireEvent.click(button);

      finish('data:image/png;base64,AAAA');
      await waitFor(() => expect(button).toBeEnabled());
      expect(mockToPng).toHaveBeenCalledTimes(1);
      expect(clickedLinks).toHaveLength(1);
    });

    it('disables the control when the graph has no resources', () => {
      render(<AppGraph graph={{ name: 'empty', resources: [] }} />);

      expect(
        screen.getByRole('button', { name: 'Download graph as PNG' }),
      ).toBeDisabled();
    });

    it('sizes the image to every node plus padding, wherever the view is panned', async () => {
      mockToPng.mockResolvedValue('data:image/png;base64,AAAA');
      const viewport = document.createElement('div');
      const nodes = [
        {
          id: 'a',
          position: { x: -100, y: 20 },
          width: 150,
          height: 50,
          data: {},
        },
        {
          id: 'b',
          position: { x: 200, y: 300 },
          width: 150,
          height: 50,
          data: {},
        },
      ];

      await exportGraphToPng(viewport, nodes);

      // Bounds: x -100..350 (450 wide), y 20..350 (330 high); 32px padding.
      expect(mockToPng).toHaveBeenCalledWith(viewport, {
        backgroundColor: '#ffffff',
        width: 514,
        height: 394,
        style: {
          width: '514px',
          height: '394px',
          transform: 'translate(132px, 12px) scale(1)',
        },
      });
    });

    it('uses the html-to-image version that keeps edges in the image', () => {
      // 1.11.12 and 1.11.13 drop React Flow's SVG edges from the exported
      // image. Check an exported graph still shows its edges before changing.
      expect(jest.requireActual('html-to-image/package.json').version).toBe(
        '1.11.11',
      );
    });

    it('builds a file-system-safe file name, with a fallback', () => {
      expect(graphImageFileName('todo-app')).toBe('todo-app-graph.png');
      expect(graphImageFileName('my app/v2')).toBe('my-app-v2-graph.png');
      expect(graphImageFileName('')).toBe('application-graph.png');
      expect(graphImageFileName(undefined)).toBe('application-graph.png');
    });
  });
});
