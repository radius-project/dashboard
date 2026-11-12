import React from 'react';
import { createRoot } from 'react-dom/client';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { kubernetesPlugin } from '@backstage/plugin-kubernetes';
import {
  createExternalRouteRef,
  createPlugin,
  useRouteRef,
} from '@backstage/core-plugin-api';
import { Link, Route } from 'react-router-dom';
import {
  ApplicationListPage,
  EnvironmentListPage,
  EnvironmentPage,
  RecipeListPage,
  ResourceListPage,
  ResourcePage,
  ResourceTypesListPage,
  ResourceTypeDetailPage,
  applicationListPageRouteRef,
  environmentListPageRouteRef,
  recipeListPageRouteRef,
  resourceListPageRouteRef,
  resourceTypesListPageRouteRef,
} from '@internal/plugin-radius';
import { basePath, mountPath, installed, HostSignIn } from './host';

const host = createPlugin({
  id: 'qualification-host',
  externalRoutes: {
    applications: createExternalRouteRef({ id: 'host-applications' }),
  },
});

function Navigation() {
  const applications = useRouteRef(applicationListPageRouteRef);
  const environments = useRouteRef(environmentListPageRouteRef);
  const recipes = useRouteRef(recipeListPageRouteRef);
  const resources = useRouteRef(resourceListPageRouteRef);
  const types = useRouteRef(resourceTypesListPageRouteRef);
  const external = useRouteRef(host.externalRoutes.applications);
  if (!external) throw new Error('Missing host applications route binding');
  return (
    <nav aria-label="Host navigation">
      {[
        ['Applications', applications()],
        ['Environments', environments()],
        ['Recipes', recipes()],
        ['Resources', resources()],
        ['Resource Types', types()],
        ['External applications', external()],
      ].map(([label, href]) => (
        <Link key={label} to={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

const app = createApp({
  plugins: [kubernetesPlugin, host],
  components: installed ? { SignInPage: HostSignIn } : {},
  bindRoutes({ bind }) {
    bind(host.externalRoutes, { applications: applicationListPageRouteRef });
  },
  configLoader: async () => [
    {
      context: 'external-legacy-host',
      data: {
        app: {
          title: 'External legacy host',
          baseUrl: `${window.location.origin}${basePath}`,
        },
        backend: { baseUrl: window.location.origin },
      },
    },
  ],
});
const Root = app.createRoot(
  <AppRouter>
    <Navigation />
    <FlatRoutes>
      <Route
        path={`${mountPath}/applications`}
        element={<ApplicationListPage />}
      />
      <Route
        path={`${mountPath}/environments`}
        element={<EnvironmentListPage />}
      />
      <Route path={`${mountPath}/recipes`} element={<RecipeListPage />} />
      <Route path={`${mountPath}/resources`} element={<ResourceListPage />} />
      <Route
        path={`${mountPath}/resource-types`}
        element={<ResourceTypesListPage />}
      />
      <Route
        path={`${mountPath}/resource-types/:namespace/:typeName`}
        element={<ResourceTypeDetailPage />}
      />
      <Route
        path={`${mountPath}/resources/:group/:namespace/:type/:name`}
        element={<ResourcePage />}
      />
      <Route
        path={`${mountPath}/environments/:group/:namespace/:type/:name`}
        element={<EnvironmentPage />}
      />
    </FlatRoutes>
  </AppRouter>,
);
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<Root />);
