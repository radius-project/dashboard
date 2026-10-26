import React from 'react';
import { createRoot } from 'react-dom/client';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { kubernetesPlugin } from '@backstage/plugin-kubernetes';
import { Route } from 'react-router-dom';
import {
  ApplicationListPage,
  EnvironmentListPage,
  EnvironmentPage,
  RecipeListPage,
  ResourceListPage,
  ResourcePage,
  ResourceTypesListPage,
  ResourceTypeDetailPage,
} from '@internal/plugin-radius';

const app = createApp({
  plugins: [kubernetesPlugin],
  configLoader: async () => [
    {
      context: 'external-legacy-host',
      data: {
        app: {
          title: 'External legacy host',
          baseUrl: `${window.location.origin}${window.location.pathname.startsWith('/nested/') ? '/nested' : ''}`,
        },
        backend: { baseUrl: window.location.origin },
      },
    },
  ],
});
const Root = app.createRoot(
  <AppRouter>
    <FlatRoutes>
      <Route path="/applications" element={<ApplicationListPage />} />
      <Route path="/environments" element={<EnvironmentListPage />} />
      <Route path="/recipes" element={<RecipeListPage />} />
      <Route path="/resources" element={<ResourceListPage />} />
      <Route path="/resource-types" element={<ResourceTypesListPage />} />
      <Route
        path="/resource-types/:namespace/:typeName"
        element={<ResourceTypeDetailPage />}
      />
      <Route
        path="/resources/:group/:namespace/:type/:name"
        element={<ResourcePage />}
      />
      <Route
        path="/environments/:group/:namespace/:type/:name"
        element={<EnvironmentPage />}
      />
    </FlatRoutes>
  </AppRouter>,
);
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<Root />);
