import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ResourceNode from '../ResourceNode';
import * as sampledata from '../../../sampledata';
import { ReactFlowProvider } from 'reactflow';

describe('ResourceNode component', () => {
  it('ResourceNode should render correctly', () => {
    const resource = sampledata.ContainerResource;
    render(
      <ReactFlowProvider>
        <ResourceNode data={resource} />
      </ReactFlowProvider>,
    );
    const name = screen.getByRole('heading', { name: resource.name });
    expect(name).toBeInTheDocument();
    const type = screen.getByRole('heading', { name: resource.type });
    expect(type).toBeInTheDocument();
  });
});
