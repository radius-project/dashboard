import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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

  it('AppGraph should render correctly with property-based resource references', () => {
    const application = sampledata.PropertyRefApplication;
    render(<AppGraph graph={application} />);

    // Verify the component renders without errors when resources reference
    // each other via properties rather than explicit connections.
    const attribution = screen.getByRole('link', {
      name: 'React Flow attribution',
    });
    expect(attribution).toBeInTheDocument();
  });
});
