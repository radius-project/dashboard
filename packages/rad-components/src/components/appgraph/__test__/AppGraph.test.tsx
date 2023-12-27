import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import AppGraph from '../AppGraph';
import * as sampledata from '../../../sampledata';
import React from 'react';

describe('AppGraph component', () => {
  it('AppGraph should render correctly', () => {
    const application = sampledata.DemoApplication;
    render(<AppGraph graph={application} />);
    const name = screen.getByRole('heading', { name: application.name });
    expect(name).toBeInTheDocument();

    // Each resource should be rendered.
    for (const resource of application.resources) {
      const name = screen.getByRole('heading', { name: resource.name });
      expect(name).toBeInTheDocument();

      const type = screen.getByRole('heading', { name: resource.type });
      expect(type).toBeInTheDocument();
    }
  });
});
