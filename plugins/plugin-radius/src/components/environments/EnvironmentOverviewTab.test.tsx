import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { EnvironmentOverviewTab } from './EnvironmentOverviewTab';
import { Resource, EnvironmentProperties } from '../../resources';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';

// Mock the child components
jest.mock('./EnvironmentDetailsTable', () => ({
  EnvironmentDetailsTable: () => (
    <div data-testid="environment-details-table">EnvironmentDetailsTable</div>
  ),
}));

jest.mock('../recipes/RecipeTable', () => ({
  RecipeTable: ({ title }: { title: string }) => (
    <div data-testid="recipe-table">RecipeTable - {title}</div>
  ),
}));

const api: Pick<RadiusApi, 'getResourceById'> = {
  getResourceById: async <T,>() =>
    ({
      id: 'unused',
      type: 'Radius.Core/recipePacks',
      name: 'unused',
      systemData: {} as Record<string, never>,
      properties: {} as T,
    }),
};

const renderTab = (environment: Resource<EnvironmentProperties>) =>
  renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <EnvironmentOverviewTab environment={environment} />
    </TestApiProvider>,
  );

describe('EnvironmentOverviewTab', () => {
  const mockEnvironment: Resource<EnvironmentProperties> = {
    id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-env',
    type: 'Applications.Core/environments',
    name: 'test-env',
    systemData: {},
    properties: {
      provisioningState: 'Succeeded',
      recipes: {
        'Applications.Datastores/redisCaches': {
          default: {
            templateKind: 'bicep',
            templatePath: 'ghcr.io/radius-project/recipes/redis:latest',
          },
        },
      },
    },
  };

  it('should render EnvironmentDetailsTable component', async () => {
    await renderTab(mockEnvironment);

    expect(screen.getByTestId('environment-details-table')).toBeInTheDocument();
    expect(screen.getByText('EnvironmentDetailsTable')).toBeInTheDocument();
  });

  it('should render RecipeTable component with title', async () => {
    await renderTab(mockEnvironment);

    expect(screen.getByTestId('recipe-table')).toBeInTheDocument();
    expect(screen.getByText('RecipeTable - Recipes')).toBeInTheDocument();
  });

  it('should render both components in Grid layout', async () => {
    const { container } = await renderTab(mockEnvironment);

    // Check that Grid containers are present
    const grids = container.querySelectorAll('.MuiGrid-container');
    expect(grids.length).toBeGreaterThan(0);

    // Check that both components are rendered
    expect(screen.getByTestId('environment-details-table')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-table')).toBeInTheDocument();
  });
});
