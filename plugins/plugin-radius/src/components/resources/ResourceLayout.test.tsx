import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { ResourceLayout } from './ResourceLayout';
import { Resource } from '../../resources';

const resource = {
  id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/containers/frontend',
  name: 'frontend',
  type: 'Applications.Core/containers',
  properties: {},
} as unknown as Resource;

const renderLayout = async () => {
  await renderInTestApp(
    <ResourceLayout resource={resource}>
      <div data-testid="child">child content</div>
    </ResourceLayout>,
  );
};

describe('ResourceLayout', () => {
  it('LY-01: describes the supplied resource without route parameters', async () => {
    await renderLayout();

    expect(
      screen.getByText(
        'Displaying details for Applications.Core/containers: frontend',
      ),
    ).toBeInTheDocument();
  });

  it('LY-02: renders its children', async () => {
    await renderLayout();

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('LY-03: titles the page generically, not per resource', async () => {
    await renderLayout();

    expect(
      screen.getByRole('heading', { name: 'Resource' }),
    ).toBeInTheDocument();
  });

  it('LY-04: uses the supplied resource rather than an unrelated host URL', async () => {
    await renderInTestApp(
      <ResourceLayout
        resource={{
          ...resource,
          name: 'backend',
          type: 'Radius.Compute/containers',
        }}
      />,
      {
        routeEntries: [
          '/resource/default/Applications.Core/applications/other-app',
        ],
      },
    );

    expect(
      screen.getByText(
        'Displaying details for Radius.Compute/containers: backend',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
