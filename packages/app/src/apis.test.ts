import {
  AnyApiFactory,
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { scmIntegrationsApiRef } from '@backstage/integration-react';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { ConfigReader } from '@backstage/config';
import { apis } from './apis';

/**
 * `apis.ts` is the host's API registry. It had 0% function coverage: the module
 * was imported by `App.tsx`, so its statements were recorded, but no factory
 * was ever invoked. A factory that throws on construction -- a missing
 * dependency, a renamed config key -- therefore fails at application startup
 * with nothing in the suite to catch it.
 *
 * These tests exercise the factories, not just the list.
 */
const factoryFor = (ref: { id: string }): AnyApiFactory => {
  const factory = apis.find(candidate => candidate.api.id === ref.id);
  if (!factory) {
    throw new Error(`no factory registered for ${ref.id}`);
  }
  return factory;
};

describe('apis', () => {
  it('AP-01: registers the SCM integrations, SCM auth, and catalog APIs', async () => {
    expect(apis.map(factory => factory.api.id).sort()).toEqual([
      'core.scmauth',
      'integration.scmintegrations',
      'plugin.catalog.service',
    ]);
  });

  it('AP-02: builds the SCM integrations API from the host config', async () => {
    const factory = factoryFor(scmIntegrationsApiRef);

    expect(factory.deps).toEqual({ configApi: configApiRef });

    const api = factory.factory({
      configApi: new ConfigReader({
        integrations: { github: [{ host: 'github.com' }] },
      }),
    });

    expect(api).toBeDefined();
  });

  it('AP-03: builds the catalog client from discovery and fetch', async () => {
    const factory = factoryFor(catalogApiRef);

    expect(factory.deps).toEqual({
      discoveryApi: discoveryApiRef,
      fetchApi: fetchApiRef,
    });

    const api = factory.factory({
      discoveryApi: { getBaseUrl: async () => 'http://localhost:7007/api' },
      fetchApi: { fetch: async () => new Response('{}') },
    });

    expect(api).toBeDefined();
  });

  it('AP-04: declares no duplicate api ids, which would silently shadow one another', async () => {
    const ids = apis.map(factory => factory.api.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
