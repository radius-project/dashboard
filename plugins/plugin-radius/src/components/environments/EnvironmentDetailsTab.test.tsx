import React from 'react';
import { render, screen } from '@testing-library/react';
import { EnvironmentDetailsTab } from './EnvironmentDetailsTab';
import { Resource, EnvironmentProperties } from '../../resources';

describe('EnvironmentDetailsTab', () => {
  const mockEnvironment: Resource<EnvironmentProperties> = {
    id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-env',
    type: 'Applications.Core/environments',
    name: 'test-env',
    systemData: {},
    properties: {
      provisioningState: 'Succeeded',
      recipes: {},
      compute: {
        namespace: 'default',
      },
      providers: {
        azure: {
          scope: '/subscriptions/test-sub-id/resourceGroups/test-rg',
        },
      },
    },
  };

  it('should render environment data as JSON', () => {
    render(<EnvironmentDetailsTab environment={mockEnvironment} />);

    // Check that the InfoCard title is rendered
    expect(screen.getByText('Environment Data')).toBeInTheDocument();

    // Check that JSON stringified data is rendered
    const preElement = screen.getByText((content, element) => {
      return (
        element?.tagName.toLowerCase() === 'pre' && content.includes('test-env')
      );
    });
    expect(preElement).toBeInTheDocument();
  });

  it('should display formatted JSON with proper indentation', () => {
    render(<EnvironmentDetailsTab environment={mockEnvironment} />);

    const preElement = document.querySelector('pre');
    expect(preElement?.textContent).toContain('"name": "test-env"');
    expect(preElement?.textContent).toContain(
      '"type": "Applications.Core/environments"',
    );
  });
});
