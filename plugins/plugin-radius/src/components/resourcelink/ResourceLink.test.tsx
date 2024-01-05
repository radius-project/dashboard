import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { ResourceLink } from './ResourceLink';
import { renderInTestApp } from '@backstage/test-utils';
import { resourcePageRouteRef } from '../../routes';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';

describe('ResourceLink', () => {
  it('should render', async () => {
    const id =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-environment';
    await renderInTestApp(<ResourceLink id={id}>Hi There!</ResourceLink>, {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
      },
    });
    expect(screen.getByRole('link', { name: 'Hi There!' })).toHaveAttribute(
      'href',
      '/resource/test-group/Applications.Core/environments/test-environment',
    );
  });

  it('should render the provided resource name', async () => {
    const id =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-environment';
    await renderInTestApp(<ResourceLink id={id} />, {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
      },
    });
    expect(
      screen.getByRole('link', { name: 'test-environment' }),
    ).toHaveAttribute(
      'href',
      '/resource/test-group/Applications.Core/environments/test-environment',
    );
  });

  it('should throw for invalid resource id', async () => {
    const id =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Cor12323231e-----/environments';
    const fallbackRender = jest.fn((_: FallbackProps) => null);
    await renderInTestApp(
      <ErrorBoundary fallbackRender={fallbackRender}>
        <ResourceLink id={id}>Should not render</ResourceLink>
      </ErrorBoundary>,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        },
      },
    );

    await waitFor(() => expect(fallbackRender).toHaveBeenCalled());
    expect(fallbackRender.mock.calls[0][0].error).toEqual(
      new Error(`Invalid resource id ${id}`),
    );
  });
});
