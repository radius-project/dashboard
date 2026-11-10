import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigReader } from '@backstage/config';
import { createApp } from '@backstage/frontend-defaults';
import radius from '@internal/plugin-radius/alpha';
import kubernetes from '@backstage/plugin-kubernetes/alpha';
import {
  createExternalRouteRef,
  createFrontendModule,
  createFrontendPlugin,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import {
  NavContentBlueprint,
  SignInPageBlueprint,
} from '@backstage/plugin-app-react';
import { Link } from 'react-router-dom';
import { basePath, mountPath, installed, HostSignIn } from './host';

const host = createFrontendPlugin({
  pluginId: 'qualification-host',
  externalRoutes: { applications: createExternalRouteRef() },
  extensions: [],
});

function Navigation() {
  const applications = useRouteRef(radius.routes.applications);
  const environments = useRouteRef(radius.routes.environments);
  const recipes = useRouteRef(radius.routes.recipes);
  const resources = useRouteRef(radius.routes.resources);
  const types = useRouteRef(radius.routes.resourceTypes);
  const external = useRouteRef(host.externalRoutes.applications);
  return (
    <nav aria-label="Host navigation">
      {[
        ['Applications', applications?.()],
        ['Environments', environments?.()],
        ['Recipes', recipes?.()],
        ['Resources', resources?.()],
        ['Resource Types', types?.()],
        ['External applications', external?.()],
      ].map(([label, href]) => {
        if (!href) throw new Error(`Missing host route binding: ${label}`);
        return (
          <Link key={label} to={href}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

const composition = createFrontendModule({
  pluginId: 'app',
  extensions: [
    NavContentBlueprint.make({ params: { component: Navigation } }),
    ...(installed
      ? [
          SignInPageBlueprint.make({
            params: { loader: async () => HostSignIn },
          }),
        ]
      : []),
  ],
});

const app = createApp({
  features: [radius, kubernetes, host, composition],
  bindRoutes({ bind }) {
    bind(host.externalRoutes, { applications: radius.routes.applications });
  },
  advanced: {
    configLoader: async () => ({
      config: new ConfigReader({
        app: {
          title: 'External native host',
          baseUrl: `${window.location.origin}${basePath}`,
          extensions: [
            ...(!installed ? [{ 'sign-in-page:app': false }] : []),
            ...Object.entries({
              applications: '/applications',
              environments: '/environments',
              environment: '/environments/:group/:namespace/:type/:name',
              recipes: '/recipes',
              resources: '/resources',
              resource: '/resources/:group/:namespace/:type/:name',
              'resource-types': '/resource-types',
              'resource-type': '/resource-types/:namespace/:typeName',
            }).map(([name, route]) => ({
              [`page:radius/${name}`]: {
                config: { path: `${mountPath}${route}` },
              },
            })),
          ],
        },
        backend: { baseUrl: window.location.origin },
      }),
    }),
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(app.createRoot());
