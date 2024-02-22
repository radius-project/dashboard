import React from 'react';
import RadiusLogomarkReverse from './RadiusLogomarkReverse';
import { render } from '@testing-library/react';

describe('RadiusLogomarkReverse', () => {
  it('should render the full logo by default', () => {
    const result = render(<RadiusLogomarkReverse />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '175 175 550 550');
  });
});
