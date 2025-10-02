import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { EnvironmentPage } from './EnvironmentPage';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { environmentPageRouteRef } from '../../routes';
import { Resource, EnvironmentProperties } from '../../resources';

// Mock the child components
jest.mock('./EnvironmentLayout', () => ({
  EnvironmentLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="environment-layout">{children}</div>
  ),
}));

jest.mock('./EnvironmentOverviewTab', () => ({
  EnvironmentOverviewTab: () => <div data-testid="overview-tab">Overview</div>,
}));

jest.mock('./EnvironmentDetailsTab', () => ({
  EnvironmentDetailsTab: () => <div data-testid="details-tab">Details</div>,
}));

jest.mock('./EnvironmentResourcesTab', () => ({
  EnvironmentResourcesTab: () => <div data-testid="resources-tab">Resources</div>,
}));

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

describe('EnvironmentPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', async () => {
    const deferred: ((resolve: Resource<EnvironmentProperties>) => void)[] = [];
    const api: Pick<RadiusApi, 'getResourceById'> = {
      getResourceById: async <T = { [key: string]: unknown }>() =>
        new Promise<Resource<T>>(resolve => {
          deferred.push(resolve as (resolve: Resource<EnvironmentProperties>) => void);
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <EnvironmentPage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/environments/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
        routeEntries: ['/environments/test-group/Applications.Core/environments/test-env'],
      },
    );

    await waitFor(() => {
      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });
  });

  it('should render error state when API call fails', async () => {
    const api: Pick<RadiusApi, 'getResourceById'> = {
      getResourceById: async () => 
        Promise.reject(new Error('Failed to fetch environment')),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <EnvironmentPage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/environments/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
        routeEntries: ['/environments/test-group/Applications.Core/environments/test-env'],
      },
    );

    await waitFor(() => {
      const elements = screen.getAllByText(/Failed to fetch environment/i);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('should render environment page with tabs when data loads successfully', async () => {
    const api: Pick<RadiusApi, 'getResourceById'> = {
      getResourceById: async <T = { [key: string]: unknown }>() => 
        Promise.resolve(mockEnvironment as Resource<T>),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <EnvironmentPage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/environments/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
        routeEntries: ['/environments/test-group/Applications.Core/environments/test-env/overview'],
      },
    );

    await waitFor(() => {
      expect(screen.getByTestId('environment-layout')).toBeInTheDocument();
    });

    // Check for tab labels (use getAllByText for multiple matches)
    const overviewTabs = screen.getAllByText('Overview');
    expect(overviewTabs.length).toBeGreaterThan(0);
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('should call API with resource ID when loading', async () => {
    const getResourceByIdMock = jest.fn().mockImplementation(async <T = { [key: string]: unknown }>() =>
      Promise.resolve(mockEnvironment as Resource<T>),
    );
    const api: Pick<RadiusApi, 'getResourceById'> = {
      getResourceById: getResourceByIdMock,
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <EnvironmentPage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/environments/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
        routeEntries: ['/environments/my-group/Applications.Core/environments/my-env'],
      },
    );

    await waitFor(() => {
      expect(getResourceByIdMock).toHaveBeenCalled();
      const callArgs = getResourceByIdMock.mock.calls[0][0];
      expect(callArgs.id).toBeDefined();
      expect(callArgs.id).toContain('/planes/radius/local/resourceGroups/');
    });
  });

  it('should render Overview tab by default', async () => {
    const api: Pick<RadiusApi, 'getResourceById'> = {
      getResourceById: async <T = { [key: string]: unknown }>() => 
        Promise.resolve(mockEnvironment as Resource<T>),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <EnvironmentPage />
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/environments/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
        routeEntries: ['/environments/test-group/Applications.Core/environments/test-env/overview'],
      },
    );

    await waitFor(() => {
      expect(screen.getByTestId('overview-tab')).toBeInTheDocument();
    });
  });
});

