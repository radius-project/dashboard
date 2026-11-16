import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KubernetesApi } from '@backstage/plugin-kubernetes';
import { RadiusApi } from '../../api';
import { RadiusApiImpl } from '../../api/api';
import { radiusApiRef } from '../../api/ref';
import {
  environmentPageRouteRef,
  resourcePageRouteRef,
  resourceTypeDetailPageRouteRef,
} from '../../routes';
import { ResourceQueryResult } from './ResourceQueryResult';
import { ResourceTable } from '../resourcetable';
import { ApplicationListInfoCard } from '../applications/ApplicationListInfoCard';
import { EnvironmentListInfoCard } from '../environments/EnvironmentListInfoCard';
import { EnvironmentListPage } from '../environments/EnvironmentListPage';
import { RecipeListPageContent } from '../recipes/RecipeListPage';
import { ResourceTypesTable } from '../resourcetypes/ResourceTypesTable';

const resource = {
  id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/available-env',
  name: 'available-env',
  type: 'Applications.Core/environments',
  systemData: {},
  properties: {
    namespace: 'Radius.Core',
    type: 'available-env',
    apiVersion: '2025-08-01',
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
  ['resource type table', () => <ResourceTypesTable title="Resource types" />],
] as const;

describe.each(consumers)('ER-08 / #369: %s', (_name, content) => {
  async function renderResult(value: (typeof resource)[], error?: Error) {
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
    const request = jest.fn().mockResolvedValue(result);
    if (error) {
      request.mockRejectedValueOnce(error);
    }
    const api: Pick<
      RadiusApi,
      | 'listResources'
      | 'listApplications'
      | 'listEnvironments'
      | 'listResourceTypes'
    > = {
      listResources: request,
      listApplications: request,
      listEnvironments: request,
      listResourceTypes: request,
    };
    const rendered = await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        {content()}
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
          '/resource-types/:namespace/:typeName':
            resourceTypeDetailPageRouteRef,
        },
      },
    );
    return { ...rendered, request };
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

  it('retries from the keyboard, retains partial data while loading, and clears the warning on success', async () => {
    const { request } = await renderResult([resource]);
    let resolveRetry:
      | ((result: { value: (typeof resource)[]; complete: boolean }) => void)
      | undefined;
    request.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRetry = resolve;
        }),
    );
    const retry = screen.getByRole('button', { name: 'Retry inventory' });
    retry.focus();
    await userEvent.keyboard('{Enter}');

    expect(
      await screen.findByRole('status', { name: 'Loading Radius inventory' }),
    ).toBeVisible();
    expect(retry).toBeDisabled();
    expect(screen.getAllByText('available-env')).not.toHaveLength(0);
    fireEvent.click(retry);
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () =>
      resolveRetry?.({ value: [resource], complete: true }),
    );
    expect(
      screen.queryByText(/Incomplete Radius inventory/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry inventory' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('available-env')).not.toHaveLength(0);
  });

  it('retains stale available data after a failed retry and permits another attempt', async () => {
    const { request } = await renderResult([resource]);
    request.mockRejectedValueOnce(
      new Error('Request failed: 403: access denied'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry inventory' }));

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some(alert => alert.textContent?.includes('403: access denied')),
      ).toBe(true),
    );
    expect(screen.getByText(/Radius inventory is out of date/)).toBeVisible();
    expect(screen.getAllByText('available-env')).not.toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(2);
    request.mockResolvedValueOnce({ value: [], complete: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry inventory' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('available-env')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Incomplete Radius inventory/),
    ).not.toBeInTheDocument();
  });

  it('recovers from incomplete empty inventory without showing a false empty state', async () => {
    const { request } = await renderResult([]);
    request.mockResolvedValueOnce({ value: [resource], complete: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry inventory' }));
    expect(await screen.findAllByText('available-env')).not.toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not retry forbidden discovery automatically and recovers only on explicit retry', async () => {
    const { request } = await renderResult(
      [],
      new Error('Request failed: 403: access denied'),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '403: access denied',
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    request.mockResolvedValueOnce({ value: [resource], complete: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry inventory' }));
    expect(await screen.findAllByText('available-env')).not.toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
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
      properties: { ...resource.properties, type: 'second-context-env' },
    };
    const second = jest.fn().mockResolvedValue({ value: [nextResource] });
    const firstApi: Pick<
      RadiusApi,
      | 'listResources'
      | 'listApplications'
      | 'listEnvironments'
      | 'listResourceTypes'
    > = {
      listResources: first,
      listApplications: first,
      listEnvironments: first,
      listResourceTypes: first,
    };
    const secondApi: typeof firstApi = {
      listResources: second,
      listApplications: second,
      listEnvironments: second,
      listResourceTypes: second,
    };
    const rendered = await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, firstApi]]}>
        {content()}
      </TestApiProvider>,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
          '/resource-types/:namespace/:typeName':
            resourceTypeDetailPageRouteRef,
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

  it('does not retain old inventory when a replacement host API fails', async () => {
    const rendered = await renderResult([resource]);
    const request = jest
      .fn()
      .mockRejectedValue(new Error('New connection unavailable'));
    rendered.rerender(
      <TestApiProvider
        apis={[
          [
            radiusApiRef,
            {
              listResources: request,
              listApplications: request,
              listEnvironments: request,
              listResourceTypes: request,
            },
          ],
        ]}
      >
        {content()}
      </TestApiProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'New connection unavailable',
    );
    expect(screen.queryByText('available-env')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Radius inventory is out of date/),
    ).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
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

it('retries failed namespace discovery through the compiled client without changing the connection', async () => {
  let forbidden = true;
  const modern = {
    ...resource,
    id: resource.id
      .replace('Applications.Core', 'Radius.Core')
      .replace('available-env', 'recovered-env'),
    type: 'Radius.Core/environments',
    name: 'recovered-env',
  };
  const kube = {
    getClusters: jest
      .fn()
      .mockResolvedValue([
        { name: 'selected-cluster' },
        { name: 'other-cluster' },
      ]),
    proxy: jest.fn(async ({ path }: Parameters<KubernetesApi['proxy']>[0]) => {
      if (path.includes('/resourceTypes/')) {
        return new Response(
          JSON.stringify({
            Name: 'Radius.Core/environments',
            APIVersions: { '2025-08-01': {} },
            APIVersionList: ['2025-08-01'],
          }),
        );
      }
      if (path.includes('/Radius.Core/environments?') && forbidden) {
        return new Response('Access denied', { status: 403 });
      }
      return new Response(
        JSON.stringify({
          value: [path.includes('/Radius.Core/') ? modern : resource],
        }),
      );
    }),
  };
  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, new RadiusApiImpl(kube)]]}>
      <ResourceTable
        title="Environments"
        resourceType="Applications.Core/environments"
      />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    },
  );
  expect(await screen.findByText(/Incomplete Radius inventory/)).toBeVisible();
  expect(screen.getByText('available-env')).toBeVisible();
  const callsBeforeRetry = kube.proxy.mock.calls.length;
  forbidden = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry inventory' }));
  expect(await screen.findByText('recovered-env')).toBeVisible();
  expect(screen.getByText('available-env')).toBeVisible();
  expect(
    screen.queryByText(/Incomplete Radius inventory/),
  ).not.toBeInTheDocument();
  expect(kube.proxy.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  expect(kube.getClusters).toHaveBeenCalledTimes(1);
  expect(
    kube.proxy.mock.calls.every(
      ([request]) => request.clusterName === 'selected-cluster',
    ),
  ).toBe(true);
});
