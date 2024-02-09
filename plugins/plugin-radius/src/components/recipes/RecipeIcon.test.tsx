import React from 'react';
import RecipeIcon from './RecipeIcon';
import { render } from '@testing-library/react';

describe('RecipeIcon', () => {
  it('should render the full logo by default', () => {
    const result = render(<RecipeIcon />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 1080 1080');
  });

  it('should render the full logo when asked', () => {
    const result = render(<RecipeIcon shape="full" />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 1080 1080');
  });

  it('should render the square logo when asked', () => {
    const result = render(<RecipeIcon shape="square" />);
    const svg = result.baseElement.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 1080 1080');
  });
});
