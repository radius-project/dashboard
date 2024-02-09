import React from 'react';
import RadiusLogomarkReverse from './RadiusLogomarkReverse';
import { render } from '@testing-library/react';

describe('RadiusLogomarkReverse', () => {
  it('should render the full logo by default', () => {
    const result = render(<RadiusLogomarkReverse />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 903.71 903.71');
  });

  it('should render the full logo when asked', () => {
    const result = render(<RadiusLogomarkReverse shape="full" />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 903.71 903.71');
  });

  it('should render the square logo when asked', () => {
    const result = render(<RadiusLogomarkReverse shape="square" />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 903.71 903.71');
  });
});
