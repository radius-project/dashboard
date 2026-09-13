import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Dagre from '@dagrejs/dagre';
import AppGraph from '../AppGraph';
import * as sampledata from '../../../sampledata';

describe('AppGraph component', () => {
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
   * degraded graph with an explanation. Tracked by #369.
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
