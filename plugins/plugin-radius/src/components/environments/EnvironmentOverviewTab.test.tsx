import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { EnvironmentOverviewTab } from './EnvironmentOverviewTab';
import { Resource, EnvironmentProperties } from '../../resources';
import { DisplayRecipe } from '../recipes/recipeAggregation';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';

// Mock the child components
jest.mock('./EnvironmentDetailsTable', () => ({
  EnvironmentDetailsTable: () => (
    <div data-testid="environment-details-table">EnvironmentDetailsTable</div>
  ),
}));

jest.mock('../recipes/RecipeTable', () => ({
  RecipeTable: ({
    title,
    recipes,
  }: {
    title: string;
    recipes: DisplayRecipe[];
  }) => (
    <div data-testid="recipe-table">
      RecipeTable - {title}
      {recipes.map(recipe => (
        <span key={recipe.type}>{recipe.type}</span>
      ))}
    </div>
  ),
}));

const api: Pick<RadiusApi, 'getResourceById'> = {
  getResourceById: async <T,>() => ({
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

  it('reports failed pack discovery, keeps available recipes, and recovers on retry', async () => {
    const packId =
      '/planes/radius/local/resourceGroups/test-group/providers/Radius.Core/recipePacks/platform';
    const getResourceById = jest
      .fn()
      .mockRejectedValueOnce(new Error('Request failed: 503: pack unavailable'))
      .mockResolvedValue({
        id: packId,
        name: 'platform',
        type: 'Radius.Core/recipePacks',
        properties: {
          recipes: {
            'Radius.Data/redisCaches': {
              kind: 'bicep',
              source: 'ghcr.io/test/redis:latest',
            },
          },
        },
      });
    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, { getResourceById }]]}>
        <EnvironmentOverviewTab
          environment={{
            ...mockEnvironment,
            properties: {
              ...mockEnvironment.properties,
              recipePacks: [packId],
            },
          }}
        />
      </TestApiProvider>,
    );

    expect(
      await screen.findByText(/Incomplete Radius inventory/),
    ).toBeVisible();
    expect(
      screen.getByText('Applications.Datastores/redisCaches'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry inventory' }));
    expect(await screen.findByText('Radius.Data/redisCaches')).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByText(/Incomplete Radius inventory/),
      ).not.toBeInTheDocument(),
    );
    expect(getResourceById).toHaveBeenCalledTimes(2);
    expect(getResourceById).toHaveBeenLastCalledWith({ id: packId });
  });
});
