import React from 'react';
import ResourceIcon from './ResourceIcon';
import { render } from '@testing-library/react';

describe('ResourceIcon', () => {
  it('should render the full logo by default', () => {
    const result = render(<ResourceIcon />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 1080 1080');
  });
});
