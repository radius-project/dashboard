import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { ResourceBreadcrumbs } from './ResourceBreadcrumbs';
import React from 'react';
import { Resource } from '../../resources';
import { resourcePageRouteRef } from '../../routes';

describe('ResourceBreadcrumbs', () => {
  it('should render breadcrumbs', async () => {
    const resource: Resource<{ [key: string]: unknown }> = {
      id: '/planes/radius/local/resourcegroups/default/providers/Applications.Datastores/redisCaches/uiCache',
      name: 'uiCache',
      type: 'Applications.Datastores/redisCaches',
      properties: {
        application:
          '/planes/radius/local/resourceGroups/default/providers/applications.core/applications/dashboard-app',
        environment:
          '/planes/radius/local/resourceGroups/default/providers/applications.core/environments/default',
      },
      systemData: {},
    };
    const rendered = await renderInTestApp(
      <ResourceBreadcrumbs resource={resource} />,
      {
        mountedRoutes: {
          '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
        },
      },
    );
    expect(rendered.getByText('default')).toBeVisible();
    expect(screen.getByRole('link', { name: 'default' })).toHaveAttribute(
      'href',
      '/resource/default/applications.core/environments/default',
    );
    expect(rendered.getByText('dashboard-app')).toBeVisible();
    expect(screen.getByRole('link', { name: 'dashboard-app' })).toHaveAttribute(
      'href',
      '/resource/default/applications.core/applications/dashboard-app',
    );
  });
});
