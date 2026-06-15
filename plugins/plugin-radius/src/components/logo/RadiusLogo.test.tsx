import React from 'react';
import RadiusLogo from './RadiusLogo';
import { render } from '@testing-library/react';

describe('RadiusLogo', () => {
  it('should render the full logo by default', () => {
    const result = render(<RadiusLogo />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 3500 950');
  });

  it('should render the full logo when asked', () => {
    const result = render(<RadiusLogo shape="full" />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 3500 950');
  });

  it('should render the square logo when asked', () => {
    const result = render(<RadiusLogo shape="square" />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 950 950');
  });
});
