import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { EnvironmentLayout } from './EnvironmentLayout';
import { Resource, EnvironmentProperties } from '../../resources';
import { environmentPageRouteRef } from '../../routes';

jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useParams: () => ({
      group: 'test-group',
      namespace: 'Applications.Core',
      type: 'environments',
      name: 'test-env',
    }),
  };
});

describe('EnvironmentLayout', () => {
  const mockEnvironment: Resource<EnvironmentProperties> = {
    id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-env',
    type: 'Applications.Core/environments',
    name: 'test-env',
    systemData: {},
    properties: {
      provisioningState: 'Succeeded',
      recipes: {},
    },
  };

  it('should render the environment layout with header and breadcrumbs', async () => {
    await renderInTestApp(
      <EnvironmentLayout environment={mockEnvironment}>
        <div>Test Child Content</div>
      </EnvironmentLayout>,
      {
        mountedRoutes: {
          '/environments/:group/:namespace/:type/:name':
            environmentPageRouteRef,
        },
      },
    );

    expect(screen.getByText('Environment')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Displaying details for Applications.Core/environments: test-env',
      ),
    ).toBeInTheDocument();

    // Check breadcrumbs
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Environments')).toBeInTheDocument();
    expect(screen.getByText('test-env')).toBeInTheDocument();
  });

  it('should render children content', async () => {
    await renderInTestApp(
      <EnvironmentLayout environment={mockEnvironment}>
        <div data-testid="child-content">Child Component</div>
      </EnvironmentLayout>,
      {
        mountedRoutes: {
          '/environments/:group/:namespace/:type/:name':
            environmentPageRouteRef,
        },
      },
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Child Component')).toBeInTheDocument();
  });

  it('should have correct breadcrumb links', async () => {
    await renderInTestApp(
      <EnvironmentLayout environment={mockEnvironment}>
        <div>Test</div>
      </EnvironmentLayout>,
      {
        mountedRoutes: {
          '/environments/:group/:namespace/:type/:name':
            environmentPageRouteRef,
        },
      },
    );

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toHaveAttribute('href', '/');

    const environmentsLink = screen.getByRole('link', { name: 'Environments' });
    expect(environmentsLink).toHaveAttribute('href', '/environments');
  });
});
