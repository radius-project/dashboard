import React, { useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider, renderInTestApp } from '@backstage/test-utils';
import { ConfigReader } from '@backstage/config';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { radiusApiRef } from './api/ref';
import { RadiusApiImpl } from './api/api';
import { configuredConnections, connectionKey } from './api/connections';
import {
  useConnectionLink,
  useRadiusConnection,
  withRadiusConnection,
} from './connection';

const first = {
  connectionId: 'same-cluster',
  plane: { type: 'radius', name: 'first' },
};
const second = {
  connectionId: 'same-cluster',
  plane: { type: 'radius', name: 'second' },
};
const ApiContext = React.createContext<RadiusApiImpl | undefined>(undefined);

const Probe = withRadiusConnection(() => {
  const connection = useRadiusConnection();
  const scopeLink = useConnectionLink();
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');
  const api = React.useContext(ApiContext);
  useEffect(() => {
    if (connection) {
      void api!
        .getResourceById({
          id: `/planes/${connection.plane.type}/${connection.plane.name}/resourceGroups/demo/providers/Radius.Core/applications/app`,
        })
        .then(resource => setName(resource.name));
    }
  }, [api, connection]);
  return (
    <>
      <output data-testid="selected">
        {connection?.plane.name ?? 'host override'}:{name}:{count}
      </output>
      <button onClick={() => setCount(count + 1)}>Change view state</button>
      <a
        href={scopeLink(
          '/nested/plugins/radius/resources/demo/Radius.Core/applications/app/application?other=kept?still-kept#details',
        )}
      >
        App Graph
      </a>
    </>
  );
});

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

async function setup(
  initial = '/nested/plugins/radius/applications',
  contexts = [first, second],
) {
  const kube = {
    getClusters: jest.fn().mockResolvedValue([{ name: 'same-cluster' }]),
    proxy: jest.fn().mockImplementation(
      async ({ path }) =>
        new Response(
          JSON.stringify(
            path.includes('/resourceTypes/')
              ? {
                  Name: 'Radius.Core/applications',
                  APIVersions: { '2025-01-01': {} },
                  APIVersionList: ['2025-01-01'],
                }
              : {
                  id: path
                    .replace('/apis/api.ucp.dev/v1alpha3', '')
                    .split('?')[0],
                  name: path.includes('/first/') ? 'first app' : 'second app',
                  type: 'Radius.Core/applications',
                  properties: {},
                },
          ),
        ),
    ),
  };
  const api = new RadiusApiImpl(kube, undefined, contexts);
  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <ApiContext.Provider value={api}>
        <Probe />
      </ApiContext.Provider>
      <LocationProbe />
    </TestApiProvider>,
    { routeEntries: [initial] },
  );
  return { api, kube };
}

async function choose(label: string) {
  fireEvent.mouseDown(
    screen.getByRole('button', { name: 'Radius connection' }),
  );
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

it('CN-02 / CN-06: requires a choice, scopes nested links and resets view state on a plane switch and back', async () => {
  const { kube } = await setup();
  await screen.findByText('Select a Radius connection to load resources.');
  expect(kube.proxy).not.toHaveBeenCalled();
  await choose('same-cluster / radius/first');
  await screen.findByText('first:first app:0');
  fireEvent.click(screen.getByRole('button', { name: 'Change view state' }));
  expect(screen.getByTestId('selected')).toHaveTextContent('first:first app:1');
  const link = new URL(
    screen.getByRole('link', { name: 'App Graph' }).getAttribute('href')!,
    'https://host.test',
  );
  expect(link.pathname).toBe(
    '/nested/plugins/radius/resources/demo/Radius.Core/applications/app/application',
  );
  expect(link.searchParams.get('radiusConnection')).toBe(connectionKey(first));
  expect(link.searchParams.get('other')).toBe('kept?still-kept');
  expect(link.hash).toBe('#details');

  await choose('same-cluster / radius/second');
  await screen.findByText('second:second app:0');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByText('first:first app:0');
});

it('CN-01 / CN-07: auto-selects only a sole connection and writes refresh-safe identity to the URL', async () => {
  await setup(undefined, [second]);
  await screen.findByText('second:second app:0');
  expect(
    new URLSearchParams(
      screen.getByTestId('location').textContent!.split('?')[1],
    ).get('radiusConnection'),
  ).toBe(connectionKey(second));
});

it('CN-07: opens a direct connection link without using the first plane', async () => {
  const { kube } = await setup(
    `/resources/app?radiusConnection=${encodeURIComponent(connectionKey(second))}`,
  );
  await screen.findByText('second:second app:0');
  expect(
    kube.proxy.mock.calls.every(([r]) =>
      r.path.includes('/planes/radius/second/'),
    ),
  ).toBe(true);
});

it('CN-08: blocks unknown links until the user chooses an available connection', async () => {
  const { kube } = await setup('/resources/app?radiusConnection=missing');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'connection was removed',
  );
  expect(kube.proxy).not.toHaveBeenCalled();
  await choose('same-cluster / radius/second');
  await screen.findByText('second:second app:0');
});

it('CN-08: hides removed connection data and recovers when the same pair is restored', async () => {
  const { api, kube } = await setup(
    `/resources/app?radiusConnection=${encodeURIComponent(connectionKey(first))}`,
  );
  await screen.findByText('first:first app:0');
  kube.getClusters.mockResolvedValue([]);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh connections' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No Radius connections are available',
  );
  expect(screen.queryByTestId('selected')).not.toBeInTheDocument();
  kube.getClusters.mockResolvedValue([{ name: 'same-cluster' }]);
  fireEvent.focus(window);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh connections' }));
  await screen.findByText('first:first app:0');
  await waitFor(() =>
    expect(api.connections.getSnapshot().error).toBeUndefined(),
  );
});

it('keeps API overrides that own connection selection usable', () => {
  render(
    <MemoryRouter>
      <TestApiProvider apis={[[radiusApiRef, {}]]}>
        <Probe />
      </TestApiProvider>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('selected')).toHaveTextContent('host override');
  expect(
    screen.queryByRole('button', { name: 'Radius connection' }),
  ).not.toBeInTheDocument();
});

it('loads only operator-configured cluster/plane pairs from host config', () => {
  expect(
    configuredConnections(
      new ConfigReader({
        radius: {
          connections: [
            {
              clusterName: 'same-cluster',
              plane: { type: 'radius', name: 'team' },
            },
          ],
        },
      }),
    ),
  ).toEqual([
    { connectionId: 'same-cluster', plane: { type: 'radius', name: 'team' } },
  ]);
  expect(configuredConnections(new ConfigReader({}))).toBeUndefined();
});
