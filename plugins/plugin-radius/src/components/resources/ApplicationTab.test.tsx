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

const mockRadiusApi: Pick<RadiusApi, 'getResourceType'> = {
  getResourceType: jest.fn().mockResolvedValue({
    Name: 'applications',
    Description: '',
    ResourceProviderNamespace: 'Applications.Core',
    APIVersions: {},
    APIVersionList: ['2023-10-01-preview'],
  }),
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

const radiusCoreRadiusApi: Pick<RadiusApi, 'getResourceType'> = {
  getResourceType: jest.fn().mockResolvedValue({
    Name: 'applications',
    Description: '',
    ResourceProviderNamespace: 'Radius.Core',
    APIVersions: {},
    APIVersionList: ['2025-01-01'],
  }),
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
});
