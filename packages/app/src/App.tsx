import React from 'react';
import { Route } from 'react-router-dom';
import { catalogPlugin } from '@backstage/plugin-catalog';
import { UserSettingsPage } from '@backstage/plugin-user-settings';
import { apis } from './apis';
import { HomepageCompositionRoot } from '@backstage/plugin-home';
import { Root } from './components/Root';
import { HomePage } from './components/home/HomePage';

import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';
import {
  ApplicationListPage,
  EnvironmentListPage,
  RecipeListPage,
  ResourceListPage,
  ResourceTypesListPage,
  ResourceTypeDetailPage,
  ResourcePage,
  radiusPlugin,
} from '@internal/plugin-radius';
import { kubernetesPlugin } from '@backstage/plugin-kubernetes';
import {
  UnifiedThemeProvider,
  createBaseThemeOptions,
  createUnifiedTheme,
  genPageTheme,
  palettes,
  shapes,
} from '@backstage/theme';

const lightTheme = createUnifiedTheme({
  ...createBaseThemeOptions({
    palette: {
      ...palettes.light,
      primary: {
        main: '#db4c24',
      },
    },
  }),
  defaultPageTheme: 'other',
  pageTheme: {
    other: genPageTheme({ colors: ['#db4c24', '#db4c24'], shape: shapes.wave }),
  },
});

const darkTheme = createUnifiedTheme({
  ...createBaseThemeOptions({
    // https://m2.material.io/inline-tools/color/
    palette: {
      ...palettes.dark,
      primary: {
        main: '#db4c24',
      },
    },
  }),
  defaultPageTheme: 'other',
  pageTheme: {
    other: genPageTheme({ colors: ['#db4c24', '#db4c24'], shape: shapes.wave }),
  },
});

const app = createApp({
  apis,
  themes: [
    {
      id: 'light',
      title: 'Light',
      variant: 'light',
      Provider: ({ children }) => (
        <UnifiedThemeProvider theme={lightTheme} children={children} />
      ),
    },
    {
      id: 'dark',
      title: 'Dark',
      variant: 'dark',
      Provider: ({ children }) => (
        <UnifiedThemeProvider theme={darkTheme} children={children} />
      ),
    },
  ],
  plugins: [
    // Called for side-effect since we're not using their UI.
    kubernetesPlugin,
  ],
  bindRoutes({ bind }) {
    bind(radiusPlugin.externalRoutes, {});
    bind(catalogPlugin.externalRoutes, {});
  },
});

const routes = (
  <FlatRoutes>
    <Route path="/" element={<HomepageCompositionRoot />}>
      <HomePage />
    </Route>
    <Route path="/settings" element={<UserSettingsPage />} />
    <Route path="/catalog-graph" element={<CatalogGraphPage />} />
    <Route path="/applications" element={<ApplicationListPage />} />
    <Route path="/environments" element={<EnvironmentListPage />} />
    <Route path="/recipes" element={<RecipeListPage />} />
    <Route path="/resource-types" element={<ResourceTypesListPage />} />
    <Route
      path="/resource-types/:namespace/:typeName"
      element={<ResourceTypeDetailPage />}
    />
    <Route path="/resources" element={<ResourceListPage />} />
    <Route
      path="/resources/:group/:namespace/:type/:name"
      element={<ResourcePage />}
    />
  </FlatRoutes>
);

export default app.createRoot(
  <>
    <AlertDisplay />
    <OAuthRequestDialog />
    <AppRouter>
      <Root>{routes}</Root>
    </AppRouter>
  </>,
);
