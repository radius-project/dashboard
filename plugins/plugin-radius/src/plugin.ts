import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const radiusPlugin = createPlugin({
  id: 'radius',
  routes: {
    root: rootRouteRef,
  },
});

export const EnvironmentPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Environments',
    component: () =>
      import('./components/EnvironmentPageComponent').then(
        m => m.EnvironmentPageComponent,
      ),
    mountPoint: rootRouteRef,
  }),
);

export const ApplicationPage = radiusPlugin.provide(
  createRoutableExtension({
    name: 'Applications',
    component: () =>
      import('./components/ApplicationPageComponent').then(
        m => m.ApplicationPageComponent,
      ),
    mountPoint: rootRouteRef,
  }),
);
