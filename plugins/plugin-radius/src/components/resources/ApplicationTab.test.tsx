import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { RadiusGraph, RadiusGraphProps } from '@radius-project/graph-react';
import { RadiusApi } from '../../api';
import { RadiusApiImpl } from '../../api/api';
import { radiusApiRef } from '../../api/ref';
import { ApplicationTab } from './ApplicationTab';

// Renderer behavior is covered in Chromium; this suite checks the host adapter.
jest.mock('@radius-project/graph-react', () => ({
  RadiusGraph: jest.fn(({ graph }: RadiusGraphProps) => (
    <div data-testid="graph-adapter">
      {graph.resources.map(resource => (
        <span key={resource.id}>{resource.name}</span>
      ))}
    </div>
  )),
}));

const resourceGroup = '/planes/radius/local/resourceGroups/test-group';
const application = `${resourceGroup}/providers/Applications.Core/applications/test-app`;
const container = `${resourceGroup}/providers/Applications.Core/containers/frontend`;
const gateway = `${resourceGroup}/providers/Applications.Core/gateways/edge`;
const graphResponse = {
  name: 'test-app',
  resources: [
    {
      id: container,
      name: 'frontend',
      type: 'Applications.Core/containers',
      provider: 'radius',
      provisioningState: 'Succeeded',
      connections: [{ id: gateway, direction: 'Inbound' }],
    },
    {
      id: gateway,
      name: 'edge',
      type: 'Applications.Core/gateways',
      provider: 'radius',
      provisioningState: 'Pending',
    },
  ],
};

const renderTab = (
  api: Pick<RadiusApi, 'getApplicationGraph'>,
  id = application,
) =>
  renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <ApplicationTab application={id} />
    </TestApiProvider>,
  );

beforeEach(() => jest.clearAllMocks());

describe('ApplicationTab host adapter', () => {
  it.each(['Applications.Core', 'Radius.Core'])(
    'GU-10 / E2E-19: renders %s with real context and the single legacy direction policy',
    async namespace => {
      const applicationId = application.replace('Applications.Core', namespace);
      const context = {
        connectionId: 'explicit-host-connection',
        plane: { type: 'radius', name: 'local' },
        applicationId,
      };
      await renderTab(
        {
          getApplicationGraph: jest.fn().mockResolvedValue({
            graph: graphResponse,
            context,
          }),
        },
        applicationId,
      );

      expect(
        await screen.findByText('Application Graph: test-app'),
      ).toBeVisible();
      expect(screen.getByText('frontend')).toBeVisible();
      const props = jest.mocked(RadiusGraph).mock.calls.at(-1)![0];
      expect(props.graph).toMatchObject({
        kind: 'live',
        context,
        resources: expect.arrayContaining([
          expect.objectContaining({
            id: gateway,
            provisioningState: 'Pending',
            connections: [{ id: container, direction: 'Outbound' }],
          }),
        ]),
      });
      expect(props.options).toMatchObject({
        showLegend: false,
        enablePopup: false,
      });
      expect(graphResponse.resources[0].connections?.[0].direction).toBe(
        'Inbound',
      );
    },
  );

  it('CN-03 / CN-04 / #356: GET and the mounted graph POST use the same resolved cluster and plane', async () => {
    const kube = {
      getClusters: jest.fn().mockResolvedValue([
        { name: 'first-cluster', authProvider: 'test' },
        { name: 'last-cluster', authProvider: 'test' },
      ]),
      proxy: jest.fn().mockImplementation(({ init, path }) => {
        let body: unknown = {
          id: application,
          name: 'test-app',
          type: 'Applications.Core/applications',
          properties: {},
        };
        if (path.includes('/resourceTypes/')) {
          body = {
            Name: 'Applications.Core/applications',
            APIVersionList: ['2025-01-01'],
            APIVersions: {},
          };
        } else if (init.method === 'POST') {
          body = graphResponse;
        }
        return Promise.resolve(new Response(JSON.stringify(body)));
      }),
    };
    const api = new RadiusApiImpl(kube);
    await api.getResourceById({ id: application });
    await renderTab(api);
    await screen.findByText('frontend');

    expect(kube.getClusters).toHaveBeenCalledTimes(1);
    expect(
      kube.proxy.mock.calls.every(
        ([request]) => request.clusterName === 'first-cluster',
      ),
    ).toBe(true);
    expect(kube.proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/apis/api.ucp.dev/v1alpha3${application}/getGraph?api-version=2025-01-01`,
        init: expect.objectContaining({ method: 'POST' }),
      }),
    );
  });

  it('CN-07: displays an unsupported-operation error for an old API override without a Kubernetes fallback', async () => {
    await renderTab({});
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The host must provide getApplicationGraph',
    );
    expect(RadiusGraph).not.toHaveBeenCalled();
  });

  it('CN-07: rejects a result for another application before rendering', async () => {
    await renderTab({
      getApplicationGraph: jest.fn().mockResolvedValue({
        graph: graphResponse,
        context: {
          connectionId: 'override',
          plane: { type: 'radius', name: 'local' },
          applicationId: application.replace('test-app', 'other-app'),
        },
      }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'does not match',
    );
    expect(RadiusGraph).not.toHaveBeenCalled();
  });

  it('GU-16 / ER-05: displays graph retrieval errors', async () => {
    await renderTab({
      getApplicationGraph: jest
        .fn()
        .mockRejectedValue(new Error('Request failed: 404')),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Request failed: 404',
    );
  });

  it.each([
    `${resourceGroup}/providers/Applications.Core/containers/absent`,
    'not-a-resource-id',
  ])(
    '#353: passes unresolved connection diagnostics to the shared renderer without losing valid topology (%s)',
    async target => {
      await renderTab({
        getApplicationGraph: jest.fn().mockResolvedValue({
          graph: {
            ...graphResponse,
            resources: [
              {
                ...graphResponse.resources[0],
                connections: [
                  ...graphResponse.resources[0].connections!,
                  { id: target, direction: 'Outbound' },
                ],
              },
              graphResponse.resources[1],
            ],
          },
          context: {
            connectionId: 'override',
            plane: { type: 'radius', name: 'local' },
            applicationId: application,
          },
        }),
      });

      expect(await screen.findByText('frontend')).toBeVisible();
      expect(screen.getByText('edge')).toBeVisible();
      const { graph } = jest.mocked(RadiusGraph).mock.calls.at(-1)![0];
      expect(graph).toMatchObject({
        warnings: [
          expect.objectContaining({
            code: 'unresolved-connection',
            severity: 'warning',
            message: expect.stringContaining(target),
          }),
        ],
        resources: expect.arrayContaining([
          expect.objectContaining({
            id: gateway,
            connections: [{ id: container, direction: 'Outbound' }],
          }),
          expect.objectContaining({ id: container, connections: [] }),
        ]),
      });
    },
  );

  it('surfaces malformed graph responses instead of rendering a successful empty graph', async () => {
    await renderTab({
      getApplicationGraph: jest.fn().mockResolvedValue({
        graph: { resources: null },
        context: {
          connectionId: 'override',
          plane: { type: 'radius', name: 'local' },
          applicationId: application,
        },
      }),
    });
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(RadiusGraph).not.toHaveBeenCalled();
  });
});
