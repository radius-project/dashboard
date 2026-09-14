import React from 'react';
import { renderWithEffects } from '@backstage/test-utils';
import App from './App';

jest.mock('@backstage/plugin-catalog', () => ({
  catalogPlugin: { externalRoutes: {} },
}));

jest.mock('@backstage/plugin-catalog-graph', () => ({
  CatalogGraphPage: () => <div>Catalog Graph</div>,
}));

jest.mock('@backstage/app-defaults', () => ({
  createApp: () => ({
    createRoot: () =>
      function MockAppRoot() {
        return <div>Mock App</div>;
      },
  }),
}));

jest.mock('@backstage/plugin-home', () => ({
  HomepageCompositionRoot: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@backstage/plugin-user-settings', () => ({
  UserSettingsPage: () => <div>User Settings</div>,
}));

jest.mock('@backstage/plugin-kubernetes', () => ({
  kubernetesPlugin: {},
}));

jest.mock('./apis', () => ({
  apis: [],
}));

jest.mock('@internal/plugin-radius', () => ({
  radiusPlugin: { externalRoutes: {} },
  ApplicationListPage: () => <div>Applications</div>,
  EnvironmentListPage: () => <div>Environments</div>,
  EnvironmentPage: () => <div>Environment</div>,
  RecipeListPage: () => <div>Recipes</div>,
  ResourceListPage: () => <div>Resources</div>,
  ResourcePage: () => <div>Resource</div>,
  ResourceTypesListPage: () => <div>Resource Types</div>,
  ResourceTypeDetailPage: () => <div>Resource Type Detail</div>,
}));

describe('App', () => {
  it('should render', async () => {
    process.env = {
      NODE_ENV: 'test',
      APP_CONFIG: [
        {
          data: {
            app: { title: 'Test' },
            backend: { baseUrl: 'http://localhost:7007' },
            techdocs: {
              storageUrl: 'http://localhost:7007/api/techdocs/static/docs',
            },
          },
          context: 'test',
        },
      ] as unknown as string,
    };

    const rendered = await renderWithEffects(<App />);
    expect(rendered.baseElement).toBeInTheDocument();
  });
});
