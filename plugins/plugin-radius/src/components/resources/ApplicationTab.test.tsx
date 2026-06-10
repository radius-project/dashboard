import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { kubernetesApiRef, KubernetesApi } from '@backstage/plugin-kubernetes';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';

// Mock the AppGraph component to avoid reactflow issues in jsdom.
jest.mock('@radapp.io/rad-components', () => ({
  ...jest.requireActual('@radapp.io/rad-components'),
  AppGraph: ({ graph }: { graph: { name: string } }) => (
    <div data-testid="app-graph">{graph.name}</div>
  ),
}));

import { ApplicationTab } from './ApplicationTab';

// Minimal mock implementations ------------------------------------------------

const mockRadiusApi: Pick<RadiusApi, 'getResourceType' | 'getResourceById'> = {
  getResourceType: jest.fn().mockResolvedValue({
    Name: 'applications',
    Description: '',
    ResourceProviderNamespace: 'Applications.Core',
    APIVersions: {},
    APIVersionList: ['2023-10-01-preview'],
  }),
  getResourceById: jest.fn().mockRejectedValue(new Error('not found')),
};

function createMockKubernetesApi(
  proxyImpl: KubernetesApi['proxy'],
): Pick<KubernetesApi, 'getClusters' | 'proxy'> {
  return {
    getClusters: jest
      .fn()
      .mockResolvedValue([
        { name: 'test-cluster', authProvider: 'serviceAccount' },
      ]),
    proxy: proxyImpl,
  };
}

// Graph response fixtures -----------------------------------------------------

const graphResponse = {
  name: 'test-app',
  resources: [
    {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/containers/frontend',
      name: 'frontend',
      type: 'Applications.Core/containers',
      provider: 'kubernetes',
      provisioningState: 'Succeeded',
    },
  ],
};

const radiusCoreGraphResponse = {
  name: 'radius-app',
  resources: [
    {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Radius.Compute/containers/frontend',
      name: 'frontend',
      type: 'Radius.Compute/containers',
      provider: 'kubernetes',
      provisioningState: 'Succeeded',
    },
  ],
};

const radiusCoreRadiusApi: Pick<
  RadiusApi,
  'getResourceType' | 'getResourceById'
> = {
  getResourceType: jest.fn().mockResolvedValue({
    Name: 'applications',
    Description: '',
    ResourceProviderNamespace: 'Radius.Core',
    APIVersions: {},
    APIVersionList: ['2025-01-01'],
  }),
  getResourceById: jest.fn().mockRejectedValue(new Error('not found')),
};

const radiusCoreApplication =
  '/planes/radius/local/resourceGroups/test-group/providers/Radius.Core/applications/radius-app';

// Tests -----------------------------------------------------------------------

describe('ApplicationTab', () => {
  it('should show the application graph on successful response', async () => {
    const mockProxy = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(graphResponse), { status: 200 }),
      );
    const kubeApi = createMockKubernetesApi(mockProxy);

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, mockRadiusApi],
        ]}
      >
        <ApplicationTab application="/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app" />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Application Graph: test-app'),
      ).toBeInTheDocument();
    });
  });

  it('should show error panel when the proxy returns a non-ok response', async () => {
    const mockProxy = jest
      .fn()
      .mockResolvedValue(new Response('Not Found', { status: 404 }));
    const kubeApi = createMockKubernetesApi(mockProxy);

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, mockRadiusApi],
        ]}
      >
        <ApplicationTab application="/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app" />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Request failed: 404');
    });
  });

  it('should show timeout error when the request exceeds 10 seconds', async () => {
    jest.useFakeTimers();

    // Proxy that never resolves — simulates a hanging backend
    const mockProxy = jest.fn().mockImplementation(
      ({ init }: { init?: RequestInit }) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(
                new DOMException('The operation was aborted.', 'AbortError'),
              );
            });
          }
        }),
    );
    const kubeApi = createMockKubernetesApi(mockProxy);

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, mockRadiusApi],
        ]}
      >
        <ApplicationTab application="/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app" />
      </TestApiProvider>,
    );

    // Advance past the 10-second timeout
    jest.advanceTimersByTime(11000);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('timed out');
    });

    jest.useRealTimers();
  });

  it('should show error panel when proxy throws a non-abort error', async () => {
    const mockProxy = jest.fn().mockRejectedValue(new Error('Network failure'));
    const kubeApi = createMockKubernetesApi(mockProxy);

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, mockRadiusApi],
        ]}
      >
        <ApplicationTab application="/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app" />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Network failure');
    });
  });

  // Radius.Core/applications tests --------------------------------------------

  it('should show the application graph for Radius.Core/applications on successful response', async () => {
    const mockProxy = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(radiusCoreGraphResponse), { status: 200 }),
      );
    const kubeApi = createMockKubernetesApi(mockProxy);

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, radiusCoreRadiusApi],
        ]}
      >
        <ApplicationTab application={radiusCoreApplication} />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Application Graph: radius-app'),
      ).toBeInTheDocument();
    });

    // Verify the proxy was called with the Radius.Core api-version
    expect(mockProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining('api-version=2025-01-01'),
      }),
    );
  });

  it('should show error panel for Radius.Core/applications when the proxy returns a non-ok response', async () => {
    const mockProxy = jest
      .fn()
      .mockResolvedValue(new Response('Not Found', { status: 404 }));
    const kubeApi = createMockKubernetesApi(mockProxy);

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, radiusCoreRadiusApi],
        ]}
      >
        <ApplicationTab application={radiusCoreApplication} />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Request failed: 404');
    });
  });

  it('should show timeout error for Radius.Core/applications when the request exceeds 10 seconds', async () => {
    jest.useFakeTimers();

    const mockProxy = jest.fn().mockImplementation(
      ({ init }: { init?: RequestInit }) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(
                new DOMException('The operation was aborted.', 'AbortError'),
              );
            });
          }
        }),
    );
    const kubeApi = createMockKubernetesApi(mockProxy);

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, radiusCoreRadiusApi],
        ]}
      >
        <ApplicationTab application={radiusCoreApplication} />
      </TestApiProvider>,
    );

    jest.advanceTimersByTime(11000);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('timed out');
    });

    jest.useRealTimers();
  });

  it('should show error panel for Radius.Core/applications when proxy throws a non-abort error', async () => {
    const mockProxy = jest.fn().mockRejectedValue(new Error('Network failure'));
    const kubeApi = createMockKubernetesApi(mockProxy);

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, radiusCoreRadiusApi],
        ]}
      >
        <ApplicationTab application={radiusCoreApplication} />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Network failure');
    });
  });

  // Property enrichment tests ---------------------------------------------------

  it('should call getResourceById for each resource to enrich properties', async () => {
    const graphWithTwoResources = {
      name: 'test-app',
      resources: [
        {
          id: '/planes/radius/local/resourceGroups/test-group/providers/Radius.Data/postgreSqlDatabases/postgresql',
          name: 'postgresql',
          type: 'Radius.Data/postgreSqlDatabases',
          provider: 'radius',
          provisioningState: 'Succeeded',
        },
        {
          id: '/planes/radius/local/resourceGroups/test-group/providers/Radius.Security/secrets/dbsecret',
          name: 'dbsecret',
          type: 'Radius.Security/secrets',
          provider: 'radius',
          provisioningState: 'Succeeded',
        },
      ],
    };

    const mockProxy = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(graphWithTwoResources), { status: 200 }),
      );
    const kubeApi = createMockKubernetesApi(mockProxy);

    const mockGetResourceById = jest.fn().mockImplementation(
      (opts: { id: string }) =>
        Promise.resolve({
          id: opts.id,
          name: 'test',
          type: 'test',
          systemData: {},
          properties: { secretName: 'dbsecret' },
        }),
    );

    const enrichingApi: Pick<RadiusApi, 'getResourceType' | 'getResourceById'> =
      {
        getResourceType: mockRadiusApi.getResourceType,
        getResourceById: mockGetResourceById,
      };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, enrichingApi],
        ]}
      >
        <ApplicationTab application="/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app" />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Application Graph: test-app'),
      ).toBeInTheDocument();
    });

    // Verify getResourceById was called for each resource in the graph.
    expect(mockGetResourceById).toHaveBeenCalledTimes(2);
    expect(mockGetResourceById).toHaveBeenCalledWith({
      id: '/planes/radius/local/resourceGroups/test-group/providers/Radius.Data/postgreSqlDatabases/postgresql',
    });
    expect(mockGetResourceById).toHaveBeenCalledWith({
      id: '/planes/radius/local/resourceGroups/test-group/providers/Radius.Security/secrets/dbsecret',
    });
  });

  it('should still render the graph when getResourceById fails for some resources', async () => {
    const mockProxy = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(graphResponse), { status: 200 }),
      );
    const kubeApi = createMockKubernetesApi(mockProxy);

    // getResourceById always rejects – the graph should still render.
    const failingApi: Pick<RadiusApi, 'getResourceType' | 'getResourceById'> =
      {
        getResourceType: mockRadiusApi.getResourceType,
        getResourceById: jest
          .fn()
          .mockRejectedValue(new Error('resource fetch failed')),
      };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubeApi],
          [radiusApiRef, failingApi],
        ]}
      >
        <ApplicationTab application="/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app" />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Application Graph: test-app'),
      ).toBeInTheDocument();
    });
  });
});
