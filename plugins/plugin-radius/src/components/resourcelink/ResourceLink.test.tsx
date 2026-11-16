import React from 'react';
import { screen, within } from '@testing-library/react';
import { Table } from '@backstage/core-components';
import { OptionalResourceLink, ResourceLink } from './ResourceLink';
import { renderInTestApp } from '@backstage/test-utils';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';

describe('ResourceLink', () => {
  it('RU-02 / #352: preserves legal dot/underscore/digit names in visible host links', async () => {
    const id =
      '/planes/radius/team.2/resourceGroups/group_1/providers/Applications.Core/environments/my.env_2';
    await renderInTestApp(<ResourceLink id={id} />, {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    });
    expect(screen.getByRole('link', { name: 'my.env_2' })).toHaveAttribute(
      'href',
      '/environment/group_1/Applications.Core/environments/my.env_2',
    );
  });
  it('should render', async () => {
    const id =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-environment';
    await renderInTestApp(<ResourceLink id={id}>Hi There!</ResourceLink>, {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    });
    expect(screen.getByRole('link', { name: 'Hi There!' })).toHaveAttribute(
      'href',
      '/environment/test-group/Applications.Core/environments/test-environment',
    );
  });

  it('should render the provided resource name', async () => {
    const id =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-environment';
    await renderInTestApp(<ResourceLink id={id} />, {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    });
    expect(
      screen.getByRole('link', { name: 'test-environment' }),
    ).toHaveAttribute(
      'href',
      '/environment/test-group/Applications.Core/environments/test-environment',
    );
  });

  it('should route non-environment resources to resource page', async () => {
    const id =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/test-app';
    await renderInTestApp(<ResourceLink id={id}>Test App</ResourceLink>, {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    });
    expect(screen.getByRole('link', { name: 'Test App' })).toHaveAttribute(
      'href',
      '/resource/test-group/Applications.Core/applications/test-app',
    );
  });

  it.each([
    'not-an-id',
    '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments',
    '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test/child/c',
    '',
  ])('renders an unparseable id as plain text: %j', async id => {
    await renderInTestApp(<ResourceLink id={id} />, {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
      },
    });

    expect(
      screen.getByRole('note', {
        name: `Invalid resource ID; link unavailable: ${id || '(empty)'}`,
      }),
    ).toHaveTextContent(id || 'Invalid resource ID');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('preserves children in the plain-text fallback and identifies the invalid id', async () => {
    await renderInTestApp(
      <OptionalResourceLink id="not-an-id">
        <strong>Test environment</strong>
      </OptionalResourceLink>,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
      },
    );

    const fallback = screen.getByRole('note', {
      name: 'Invalid resource ID; link unavailable: not-an-id',
    });
    expect(within(fallback).getByText('Test environment').tagName).toBe(
      'STRONG',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each([
    ['Radius.Core/environments', 'environment'],
    ['Radius.Data/neo4jDatabases', 'resource'],
  ])('preserves nested host routes and children for %s', async (type, page) => {
    const id = `/planes/radius/local/resourceGroups/group_1/providers/${type}/my.env_2`;
    await renderInTestApp(
      <ResourceLink id={id}>
        <strong>Resource details</strong>
      </ResourceLink>,
      {
        mountedRoutes: {
          '/host/tools/radius/resource/:group/:namespace/:type/:name':
            resourcePageRouteRef,
          '/host/tools/radius/environment/:group/:namespace/:type/:name':
            environmentPageRouteRef,
        },
      },
    );

    const link = screen.getByRole('link', { name: 'Resource details' });
    expect(link).toHaveAttribute(
      'href',
      `/host/tools/radius/${page}/group_1/${type}/my.env_2`,
    );
    expect(within(link).getByText('Resource details').tagName).toBe('STRONG');
  });

  it('#352: one malformed cell leaves the table and healthy links visible', async () => {
    const invalidId =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Cor12323231e-----/environments';
    const validId =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/applications/healthy';
    await renderInTestApp(
      <Table
        title="Resources"
        columns={[
          {
            title: 'Name',
            render: row => <ResourceLink id={row.id} />,
          },
        ]}
        data={[{ id: invalidId }, { id: validId }]}
        options={{ search: false, paging: false }}
      />,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
          '/environment/:group/:namespace/:type/:name': environmentPageRouteRef,
        },
      },
    );

    const table = screen.getByRole('table');
    expect(within(table).getByText(invalidId)).toBeVisible();
    expect(
      within(table).getByRole('link', { name: 'healthy' }),
    ).toHaveAttribute(
      'href',
      '/resource/test-group/Applications.Core/applications/healthy',
    );
    expect(within(table).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText(/Something Went Wrong/i)).not.toBeInTheDocument();
  });
});
