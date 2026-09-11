import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { radiusApiRef } from '../../plugin';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';
import { DetailsTab } from './DetailsTab';
import { RadiusApi } from '../../api';
import { Resource } from '../../resources';

const resource = {
  id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/containers/frontend',
  name: 'frontend',
  type: 'Applications.Core/containers',
  properties: { image: 'nginx:latest' },
} as unknown as Resource;

const renderTab = async (value: Resource) => {
  const api: Partial<RadiusApi> = {};

  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <DetailsTab resource={value} />
    </TestApiProvider>,
    {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    },
  );
};

describe('DetailsTab', () => {
  it('DT-01: renders the raw resource payload', async () => {
    await renderTab(resource);

    expect(screen.getByText('Resource Data')).toBeInTheDocument();
  });

  /**
   * The tab is a `JSON.stringify` of whatever it is handed, so the meaningful
   * assertion is that the payload round-trips rather than that particular text
   * appears. Parsing it back also catches a truncated or double-encoded render,
   * which a substring match would not.
   */
  it('DT-02: renders the payload as parseable JSON matching the resource', async () => {
    await renderTab(resource);

    const pre = document.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(JSON.parse(pre?.textContent ?? '')).toEqual(resource);
  });

  it('DT-03: shows breadcrumbs above the payload', async () => {
    await renderTab(resource);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
