import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { Resource } from '../../resources';
import { ResourcePage } from './ResourcePage';

jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useParams: () => ({
      group: 'test-group',
      namespace: 'Applications.Core',
      type: 'applications',
      name: 'test-app',
    }),
  };
});

describe('ResourcePage', () => {
  it('should display loading indicator while loading', async () => {
    // This is the boilerplate for an unresolved promise.
    const deferred: ((resolve: Resource<unknown>) => void)[] = [];
    const api: Pick<RadiusApi, 'getResourceById'> = {
      getResourceById: async <T = { [key: string]: unknown },>() =>
        new Promise<Resource<T>>(resolve => {
          deferred.push(
            resolve as unknown as (resolve: Resource<unknown>) => void,
          );
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourcePage />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    // "Complete" the loading of resources.
    deferred[0]({
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app',
      type: 'Applications.Core/applications',
      name: 'test-app',
      systemData: {},
      properties: {},
    });

    await waitFor(() => {
      expect(screen.queryByTestId('progress')).toBeNull();
    });

    expect(
      screen.getByText(
        'Displaying details for Applications.Core/applications: test-app',
      ),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
  });

  it('should display error message when loading fails', async () => {
    const api: Pick<RadiusApi, 'getResourceById'> = {
      getResourceById: async () => Promise.reject(new Error('Oh noes!')),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourcePage />
      </TestApiProvider>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Oh noes!');
  });

  it('should render when loaded', async () => {
    const api: Pick<RadiusApi, 'getResourceById'> = {
      getResourceById: async <T = { [key: string]: unknown },>() =>
        Promise.resolve({
          id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app',
          type: 'Applications.Core/applications',
          name: 'test-app',
          systemData: {},
          properties: {} as T,
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ResourcePage />
      </TestApiProvider>,
    );

    expect(
      screen.getByText(
        'Displaying details for Applications.Core/applications: test-app',
      ),
    ).toBeInTheDocument();
  });
});
