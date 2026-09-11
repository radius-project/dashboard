import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { radiusApiRef } from '../../plugin';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';
import { OverviewTab } from './OverviewTab';
import { RadiusApi } from '../../api';
import { Resource } from '../../resources';

const makeResource = (overrides: Partial<Resource> = {}): Resource =>
  ({
    id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/containers/frontend',
    name: 'frontend',
    type: 'Applications.Core/containers',
    properties: {},
    ...overrides,
  }) as Resource;

const renderTab = async (resource: Resource) => {
  const api: Partial<RadiusApi> = {};

  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <OverviewTab resource={resource} />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    },
  );
};

describe('OverviewTab', () => {
  it('OT-01: shows the resource name, type, and group', async () => {
    await renderTab(makeResource());

    expect(screen.getAllByText('frontend').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Applications.Core/containers').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('default').length).toBeGreaterThan(0);
  });

  /**
   * The group is derived by parsing the id rather than read from a field, so an
   * id the parser rejects loses the row entirely instead of failing loudly.
   * `OverviewTab` is the safe consumer of `parseResourceId` — it uses optional
   * chaining — which is worth pinning next to the two cards that are not.
   */
  it('OT-02: omits the group rather than failing when the id cannot be parsed', async () => {
    await renderTab(makeResource({ id: 'not-a-resource-id', properties: {} }));

    expect(screen.getAllByText('frontend').length).toBeGreaterThan(0);
    expect(screen.queryByText('default')).toBeNull();
  });

  it('OT-03: links to the environment when the resource has one', async () => {
    await renderTab(
      makeResource({
        properties: {
          environment:
            '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/prod',
        },
      }),
    );

    expect(
      screen.getAllByRole('link', { name: 'prod' }).length,
    ).toBeGreaterThan(0);
  });

  it('OT-04: links to the application when the resource has one', async () => {
    await renderTab(
      makeResource({
        properties: {
          application:
            '/planes/radius/local/resourceGroups/default/providers/Applications.Core/applications/store',
        },
      }),
    );

    expect(
      screen.getAllByRole('link', { name: 'store' }).length,
    ).toBeGreaterThan(0);
  });

  it('OT-05: omits the environment and application rows when absent', async () => {
    await renderTab(makeResource());

    expect(screen.queryByText('environment')).toBeNull();
    expect(screen.queryByText('application')).toBeNull();
  });

  it('OT-06: does not show a recipe table for an ordinary resource', async () => {
    await renderTab(makeResource());

    expect(screen.queryByText('Recipes')).toBeNull();
  });

  /**
   * The recipe table appears only for `Radius.Core/recipePacks`, matched on the
   * exact type string. This is one of the few places the newer `Radius.*`
   * namespace is already load-bearing in shipped code, so it is worth a test
   * before the namespace migration in Phase 9 touches it.
   */
  it('OT-07: shows the aggregated recipes for a recipe pack', async () => {
    await renderTab(
      makeResource({
        id: '/planes/radius/local/resourceGroups/default/providers/Radius.Core/recipePacks/kubernetes-pack',
        name: 'kubernetes-pack',
        type: 'Radius.Core/recipePacks',
        properties: {
          recipes: {
            'Radius.Data/redisCaches': {
              kind: 'bicep',
              source: 'ghcr.io/radius/redis:latest',
            },
          },
        },
      }),
    );

    expect(screen.getByText('Recipes')).toBeInTheDocument();
    expect(
      screen.getAllByText('ghcr.io/radius/redis:latest').length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Radius.Data/redisCaches').length).toBe(1);
  });
});
