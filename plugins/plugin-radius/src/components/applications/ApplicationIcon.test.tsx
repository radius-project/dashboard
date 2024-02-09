import React from 'react';
import ApplicationIcon from './ApplicationIcon';
import { render } from '@testing-library/react';

describe('ApplicationIcon', () => {
  it('should render the full logo by default', () => {
    const result = render(<ApplicationIcon />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 1080 1080');
  });

  it('should render the full logo when asked', () => {
    const result = render(<ApplicationIcon shape="full" />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 1080 1080');
  });

  it('should render the square logo when asked', () => {
    const result = render(<ApplicationIcon shape="square" />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 1080 1080');
  });
});
