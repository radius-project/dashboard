import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { ResourceTypeDetailPage } from './ResourceTypeDetailPage';

jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useParams: () => ({
      namespace: 'Applications.Core',
      typeName: 'containers',
    }),
  };
});

describe('ResourceTypeDetailPage', () => {
  it('should display loading indicator while loading', async () => {
    // This is the boilerplate for an unresolved promise.
    const deferred: ((
      resolve: {
        Name: string;
        Description: string;
        ResourceProviderNamespace: string;
        APIVersions: Record<string, { Schema?: unknown }>;
        APIVersionList: string[];
      },
    ) => void)[] = [];
    const api: Pick<RadiusApi, 'getResourceType'> = {
      getResourceType: async () =>
        new Promise<{
          Name: string;
          Description: string;
          ResourceProviderNamespace: string;
          APIVersions: Record<string, { Schema?: unknown }>;
          APIVersionList: string[];
        }>(resolve => {
          deferred.push(resolve);
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypeDetailPage />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    // "Complete" the loading of resource type.
    deferred[0]({
      Name: 'containers',
      Description: 'Container resources',
      ResourceProviderNamespace: 'Applications.Core',
      APIVersions: {
        '2023-10-01-preview': {
          Schema: {
            properties: {},
            required: [],
          },
        },
      },
      APIVersionList: ['2023-10-01-preview'],
    });

    await waitFor(() => {
      expect(screen.queryByTestId('progress')).toBeNull();
    });

    expect(screen.getByRole('heading', { name: 'containers' })).toBeInTheDocument();
    expect(
      screen.getByText('Resource Type in Applications.Core'),
    ).toBeInTheDocument();
  });

  it('should display error message when loading fails', async () => {
    const api: Pick<RadiusApi, 'getResourceType'> = {
      getResourceType: async () => Promise.reject(new Error('Oh noes!')),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypeDetailPage />
      </TestApiProvider>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Oh noes!');
  });

  it('should render when loaded', async () => {
    const api: Pick<RadiusApi, 'getResourceType'> = {
      getResourceType: async () =>
        Promise.resolve({
          Name: 'containers',
          Description: 'Container resources',
          ResourceProviderNamespace: 'Applications.Core',
          APIVersions: {
            '2023-10-01-preview': {
              Schema: {
                properties: {
                  container: {
                    type: 'object',
                    description: 'Container configuration',
                  },
                },
                required: ['container'],
              },
            },
          },
          APIVersionList: ['2023-10-01-preview'],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourceTypeDetailPage />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'containers' })).toBeInTheDocument();
    });

    expect(
      screen.getByText('Resource Type in Applications.Core'),
    ).toBeInTheDocument();
  });
});
