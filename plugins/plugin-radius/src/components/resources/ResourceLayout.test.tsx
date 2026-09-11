import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { resourcePageRouteRef } from '../../routes';
import { ResourceLayout } from './ResourceLayout';
import { Resource } from '../../resources';

const resource = {
  id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/containers/frontend',
  name: 'frontend',
  type: 'Applications.Core/containers',
  properties: {},
} as unknown as Resource;

/**
 * The layout builds its subtitle from the *route parameters* rather than from
 * the resource it is handed. That distinction is the point of this suite: the
 * two can disagree, and the heading follows the URL.
 *
 * `useRouteRefParams` is mocked because it reads parameters from the matched
 * route, and `renderInTestApp` mounts the element at the test root rather than
 * under the resource route. Mocking it keeps the happy path honest instead of
 * silently testing the empty case, which LY-04 covers deliberately.
 */
let routeParams: Record<string, string | undefined> = {};

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useRouteRefParams: () => routeParams,
}));

const renderLayout = async () => {
  await renderInTestApp(
    <ResourceLayout resource={resource}>
      <div data-testid="child">child content</div>
    </ResourceLayout>,
    {
      mountedRoutes: {
        '/resource/:group/:namespace/:type/:name': resourcePageRouteRef,
      },
    },
  );
};

describe('ResourceLayout', () => {
  beforeEach(() => {
    routeParams = {
      group: 'default',
      namespace: 'Applications.Core',
      type: 'containers',
      name: 'frontend',
    };
  });

  it('LY-01: describes the resource from the route parameters', async () => {
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

  /**
   * KNOWN-DEFECT, tracked by radius-project/dashboard#362.
   *
   * The subtitle is built by template-interpolating route parameters with no
   * guard, so when they are missing the user is shown the literal text
   * "Displaying details for undefined/undefined: undefined".
   *
   * This is reachable today only by rendering the layout outside its route,
   * which is exactly what a Backstage host embedding the plugin may do — the
   * component is not marked internal, and the rearchitecture actively
   * encourages composing these pieces elsewhere. Recording it now means the
   * extraction cannot quietly turn a route-shaped assumption into a visible
   * defect for consumers.
   *
   * It also demonstrates why LY-01 mocks the hook: without the mock, LY-01
   * would render this string and a loose assertion would have called it a pass.
   */
  it('LY-04: KNOWN-DEFECT renders literal "undefined" when route parameters are absent', async () => {
    routeParams = {};

    await renderLayout();

    expect(
      screen.getByText('Displaying details for undefined/undefined: undefined'),
    ).toBeInTheDocument();
  });
});
