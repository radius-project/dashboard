import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { act, screen, waitFor } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../api/ref';
import { environmentPageRouteRef, resourcePageRouteRef } from '../../routes';
import { ResourceQueryResult } from './ResourceQueryResult';
import { ResourceTable } from '../resourcetable';
import { ApplicationListInfoCard } from '../applications/ApplicationListInfoCard';
import { EnvironmentListInfoCard } from '../environments/EnvironmentListInfoCard';
import { EnvironmentListPage } from '../environments/EnvironmentListPage';
import { RecipeListPageContent } from '../recipes/RecipeListPage';

const resource = {
  id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/available-env',
  name: 'available-env',
  type: 'Applications.Core/environments',
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

const consumers = [
  ['resource table', () => <ResourceTable title="Resources" />],
  ['application card', () => <ApplicationListInfoCard />],
  ['environment card', () => <EnvironmentListInfoCard />],
  ['environment page', () => <EnvironmentListPage />],
  ['recipe inventory', () => <RecipeListPageContent />],
] as const;

describe.each(consumers)('ER-08 / #369: %s', (_name, content) => {
  async function renderResult(value: (typeof resource)[]) {
    const result = {
      value,
      complete: false,
      errors: [
        {
          resourceType: 'Radius.Core/environments',
          error: new Error('Request failed: 503: inventory unavailable'),
        },
      ],
    };
    const api: Pick<
      RadiusApi,
      'listResources' | 'listApplications' | 'listEnvironments'
    > = {
      listResources: jest.fn().mockResolvedValue(result),
      listApplications: jest.fn().mockResolvedValue(result),
      listEnvironments: jest.fn().mockResolvedValue(result),
    };
    return renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        {content()}
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
      },
    );
  }

  it('shows available data with a visible incomplete-inventory warning', async () => {
    await renderResult([resource]);

    expect(
      await screen.findByText(/Incomplete Radius inventory/),
    ).toBeVisible();
    expect(screen.getAllByText(/inventory unavailable/)).not.toHaveLength(0);
    expect(screen.getAllByText('available-env')).not.toHaveLength(0);
  });

  it('shows an error instead of a successful empty state when incomplete data has no resources', async () => {
    await renderResult([]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No Radius inventory data is available',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('503');
    expect(screen.queryByText('No records to display')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Select an environment to display recipes.'),
    ).not.toBeInTheDocument();
  });

  it('does not reuse a late result after the host API context changes', async () => {
    let resolveFirst:
      ((value: { value: (typeof resource)[] }) => void) | undefined;
    const first = jest.fn().mockReturnValue(
      new Promise<{ value: (typeof resource)[] }>(resolve => {
        resolveFirst = resolve;
      }),
    );
    const nextResource = {
      ...resource,
      id: resource.id.replace('available-env', 'second-context-env'),
      name: 'second-context-env',
    };
    const second = jest.fn().mockResolvedValue({ value: [nextResource] });
    const firstApi: Pick<
      RadiusApi,
      'listResources' | 'listApplications' | 'listEnvironments'
    > = {
      listResources: first,
      listApplications: first,
      listEnvironments: first,
    };
    const secondApi: typeof firstApi = {
      listResources: second,
      listApplications: second,
      listEnvironments: second,
    };
    const rendered = await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, firstApi]]}>
        {content()}
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
      },
    );
    await waitFor(() => expect(first).toHaveBeenCalled());

    rendered.rerender(
      <TestApiProvider apis={[[radiusApiRef, secondApi]]}>
        {content()}
      </TestApiProvider>,
    );
    expect(await screen.findAllByText('second-context-env')).not.toHaveLength(
      0,
    );
    await act(async () => resolveFirst?.({ value: [resource] }));
    expect(screen.queryByText('available-env')).not.toBeInTheDocument();
    expect(screen.getAllByText('second-context-env')).not.toHaveLength(0);
  });
});

it('keeps an environment without recipes visible with a warning instead of a fatal error', async () => {
  const api = {
    listEnvironments: jest.fn().mockResolvedValue({
      value: [{ ...resource, properties: { provisioningState: 'Succeeded' } }],
      complete: false,
      errors: [
        {
          resourceType: 'Radius.Core/environments',
          error: new Error('Request failed: 503: inventory unavailable'),
        },
      ],
    }),
    getResourceById: jest.fn(),
  };
  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <RecipeListPageContent />
    </TestApiProvider>,
  );
  expect(await screen.findByText(/Incomplete Radius inventory/)).toBeVisible();
  expect(
    screen.queryByText(/No Radius inventory data is available/),
  ).not.toBeInTheDocument();
});

it('preserves metadata-free override results without asserting completeness', async () => {
  await renderInTestApp(
    <ResourceQueryResult result={{ value: [] }}>
      <span>Override result</span>
    </ResourceQueryResult>,
  );
  expect(screen.getByText('Override result')).toBeVisible();
  expect(
    screen.queryByText(/Incomplete Radius inventory/),
  ).not.toBeInTheDocument();
});

it('does not hide explicit errors if an override omits complete metadata', async () => {
  await renderInTestApp(
    <ResourceQueryResult
      result={{ value: [resource], errors: [{ error: 'Request failed' }] }}
    >
      <span>Available data</span>
    </ResourceQueryResult>,
  );
  expect(screen.getByText(/Incomplete Radius inventory/)).toBeVisible();
  expect(screen.getByText('Available data')).toBeVisible();
});
