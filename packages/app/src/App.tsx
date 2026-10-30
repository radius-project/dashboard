import React from 'react';
import catalog from '@backstage/plugin-catalog/alpha';
import settings from '@backstage/plugin-user-settings/alpha';
import { apis } from './apis';
import home from '@backstage/plugin-home/alpha';
import { RadiusSidebar } from './components/Root';
import { HomePage } from './components/home/HomePage';

import { ProxiedSignInPage } from '@backstage/core-components';
import { createApp } from '@backstage/frontend-defaults';
import {
  createFrontendModule,
  ApiBlueprint,
  type FrontendFeature,
} from '@backstage/frontend-plugin-api';
import {
  NavContentBlueprint,
  SignInPageBlueprint,
  ThemeBlueprint,
} from '@backstage/plugin-app-react';
import { HomePageLayoutBlueprint } from '@backstage/plugin-home-react/alpha';
import catalogGraph from '@backstage/plugin-catalog-graph/alpha';
import { default as radius } from '@internal/plugin-radius/alpha';
import kubernetes from '@backstage/plugin-kubernetes/alpha';
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

const host = createFrontendModule({
  pluginId: 'app',
  extensions: [
    ...apis.map(factory =>
      ApiBlueprint.make({
        name: factory.api.id,
        params: define => define(factory),
      }),
    ),
    SignInPageBlueprint.make({
      params: {
        loader: async () => props => (
          <ProxiedSignInPage {...props} provider="guest" />
        ),
      },
    }),
    ThemeBlueprint.make({
      name: 'light',
      params: {
        theme: {
          id: 'light',
          title: 'Light',
          variant: 'light',
          Provider: ({ children }) => (
            <UnifiedThemeProvider theme={lightTheme}>
              {children}
            </UnifiedThemeProvider>
          ),
        },
      },
    }),
    ThemeBlueprint.make({
      name: 'dark',
      params: {
        theme: {
          id: 'dark',
          title: 'Dark',
          variant: 'dark',
          Provider: ({ children }) => (
            <UnifiedThemeProvider theme={darkTheme}>
              {children}
            </UnifiedThemeProvider>
          ),
        },
      },
    }),
    NavContentBlueprint.make({
      params: { component: RadiusSidebar },
    }),
  ],
});

const homeLayout = createFrontendModule({
  pluginId: 'home',
  extensions: [
    home.getExtension('page:home').override({
      factory: (original, { config }) =>
        original({
          config: { ...config, path: config.path ?? '/' },
        }),
    }),
    HomePageLayoutBlueprint.make({
      params: { loader: async () => HomePage },
    }),
  ],
});
const catalogApis = createFrontendModule({
  pluginId: 'catalog',
  extensions: [
    ApiBlueprint.make({
      params: define => define(catalogApiFactory),
    }),
  ],
});

export const features: FrontendFeature[] = [
  radius,
  kubernetes,
  catalog,
  catalogGraph,
  home,
  settings,
  host,
  homeLayout,
  catalogApis,
];

const app = createApp({
  features,
  bindRoutes({ bind }) {
    bind(catalogGraph.externalRoutes, {
      catalogEntity: catalog.routes.catalogEntity,
    });
  },
});

export default app.createRoot();
