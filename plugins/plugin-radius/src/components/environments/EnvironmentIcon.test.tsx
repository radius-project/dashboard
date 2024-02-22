import React from 'react';
import EnvironmentIcon from './EnvironmentIcon';
import { render } from '@testing-library/react';

describe('EnvironmentIcon', () => {
  it('should render the full logo by default', () => {
    const result = render(<EnvironmentIcon />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 1080 1080');
  });
});
