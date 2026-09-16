import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { RecipeListPage } from './RecipeListPage';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import {
  EnvironmentProperties,
  RecipePackProperties,
  Resource,
  ResourceList,
} from '../../resources';

/**
 * RE-xx: characterization tests for the recipe list page.
 *
 * The page is the only consumer of `aggregateRecipesFromEnvironment` that
 * exercises the asynchronous half of the feature: the recipe pack ids live on
 * the environment, and each pack is fetched separately. The aggregation itself
 * has its own unit tests; these cover the fetch fan-out, the failure paths and
 * the environment selector, which had no coverage at all.
 */

const PACK_ID =
  '/planes/radius/local/resourceGroups/default/providers/Radius.Core/recipePacks/platform';

const legacyEnvironment: Resource<EnvironmentProperties> = {
  id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/legacy',
  name: 'legacy',
  type: 'Applications.Core/environments',
  systemData: {},
  properties: {
    provisioningState: 'Succeeded',
    recipes: {
      'Applications.Datastores/redisCaches': {
        default: {
          templateKind: 'bicep',
          templatePath: 'ghcr.io/radius-project/recipes/redis:latest',
        },
      },
    },
  },
};

const packEnvironment: Resource<EnvironmentProperties> = {
  id: '/planes/radius/local/resourceGroups/default/providers/Radius.Core/environments/modern',
  name: 'modern',
  type: 'Radius.Core/environments',
  systemData: {},
  properties: {
    provisioningState: 'Succeeded',
    recipes: {},
    recipePacks: [PACK_ID],
  },
};

const pack: Resource<RecipePackProperties> = {
  id: PACK_ID,
  name: 'platform',
  type: 'Radius.Core/recipePacks',
  systemData: {},
  properties: {
    recipes: {
      'Radius.Data/redisCaches': {
        kind: 'bicep',
        source: 'ghcr.io/radius-project/recipes/redis:latest',
      },
    },
  },
};

const renderPage = async (api: Partial<RadiusApi>) =>
  renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <RecipeListPage />
    </TestApiProvider>,
  );

const apiReturning = (
  environments: Resource<EnvironmentProperties>[],
  packs: Resource<RecipePackProperties>[] = [],
): Pick<RadiusApi, 'listEnvironments' | 'getResourceById'> => ({
  listEnvironments: async <T = EnvironmentProperties,>() =>
    Promise.resolve({
      value: environments,
    } as unknown as ResourceList<T>),
  getResourceById: async <T = { [key: string]: unknown },>(opts: {
    id: string;
  }) => {
    const found = packs.find(p => p.id.toLowerCase() === opts.id.toLowerCase());
    if (!found) {
      throw new Error(`no such resource: ${opts.id}`);
    }
    return found as unknown as Resource<T>;
  },
});

describe('RecipeListPage', () => {
  it('RE-01: renders the page header', async () => {
    await renderPage(apiReturning([]));

    expect(
      screen.getByText('Displaying recipes to create cloud infrastructure.'),
    ).toBeInTheDocument();
  });

  it('RE-02: prompts for an environment when none exist', async () => {
    await renderPage(apiReturning([]));

    expect(
      screen.getByText('Select an environment to display recipes.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('RE-03: renders the error panel when the environment list fails', async () => {
    const api: Pick<RadiusApi, 'listEnvironments'> = {
      listEnvironments: async () => {
        throw new Error('boom');
      },
    };

    await renderPage(api);

    expect((await screen.findAllByText(/boom/)).length).toBeGreaterThan(0);
    expect(
      screen.queryByText('Select an environment to display recipes.'),
    ).not.toBeInTheDocument();
  });

  it('RE-04: shows the inline recipes of a legacy environment', async () => {
    await renderPage(apiReturning([legacyEnvironment]));

    const table = await screen.findByRole('table');
    expect(table).toBeInTheDocument();
    expect(
      screen.getByText('Applications.Datastores/redisCaches'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('ghcr.io/radius-project/recipes/redis:latest'),
    ).toBeInTheDocument();
  });

  it('RE-05: fetches every referenced recipe pack and shows its recipes', async () => {
    const requested: string[] = [];
    const api = apiReturning([packEnvironment], [pack]);
    const spied: Pick<RadiusApi, 'listEnvironments' | 'getResourceById'> = {
      ...api,
      getResourceById: async opts => {
        requested.push(opts.id);
        return api.getResourceById(opts);
      },
    };

    await renderPage(spied);

    await screen.findByRole('table');
    expect(requested).toEqual([PACK_ID]);
    expect(screen.getByText('Radius.Data/redisCaches')).toBeInTheDocument();
    expect(screen.getByText('platform')).toBeInTheDocument();
  });

  it('RE-06: tolerates a recipe pack that cannot be fetched', async () => {
    // `Promise.allSettled` means one unreachable pack must not fail the page.
    await renderPage(apiReturning([packEnvironment], []));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(
      screen.queryByText('Radius.Data/redisCaches'),
    ).not.toBeInTheDocument();
  });

  it('RE-07: requests each distinct pack id only once across environments', async () => {
    const requested: string[] = [];
    const second: Resource<EnvironmentProperties> = {
      ...packEnvironment,
      id: `${packEnvironment.id}-two`,
      name: 'modern-two',
    };
    const api = apiReturning([packEnvironment, second], [pack]);

    await renderPage({
      ...api,
      getResourceById: async opts => {
        requested.push(opts.id);
        return api.getResourceById(opts);
      },
    });

    await screen.findByRole('table');
    expect(requested).toEqual([PACK_ID]);
  });

  it('RE-08: selects the first environment by default and can switch', async () => {
    await renderPage(
      apiReturning([legacyEnvironment, packEnvironment], [pack]),
    );

    await screen.findByRole('table');
    expect(
      screen.getByText('Applications.Datastores/redisCaches'),
    ).toBeInTheDocument();

    fireEvent.mouseDown(screen.getAllByRole('button')[0]);
    fireEvent.click(await screen.findByRole('option', { name: 'modern' }));

    await waitFor(() =>
      expect(screen.getByText('Radius.Data/redisCaches')).toBeInTheDocument(),
    );
    expect(
      screen.queryByText('Applications.Datastores/redisCaches'),
    ).not.toBeInTheDocument();
  });
});
