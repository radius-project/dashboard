import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mockServices } from '@backstage/backend-test-utils';
import {
  createBackendPlugin,
  createServiceRef,
} from '@backstage/backend-plugin-api';
import { createRadiusBackend } from './src/createRadiusBackend.ts';

export interface TestCluster {
  [key: string]: string;
  name: string;
  url: string;
  authProvider: 'serviceAccount';
  serviceAccountToken: string;
}

export interface TestHostOptions {
  installedFrontend?: boolean;
  basePath?: string;
  mountPath?: string;
  publicBaseUrl?: string;
  backendFactory?: typeof createRadiusBackend;
}

export function testBackendConfig(
  clusters: TestCluster[],
  port: number,
  options: TestHostOptions = {},
) {
  const baseUrl = options.publicBaseUrl ?? `http://127.0.0.1:${port}`;
  return {
    app: {
      baseUrl: `${baseUrl}${options.basePath ?? ''}`,
      title: 'Radius Dashboard',
      packageName: '@internal/app',
      ...(options.mountPath
        ? {
            extensions: [
              ['applications', 'applications'],
              ['environments', 'environments'],
              ['resources', 'resources'],
              ['recipes', 'recipes'],
              ['resource-types', 'resource-types'],
              ['resource-type', 'resource-types/:namespace/:typeName'],
              ['resource', 'resources/:group/:namespace/:type/:name'],
              ['environment', 'environments/:group/:namespace/:type/:name'],
            ].map(([name, route]) => ({
              [`page:radius/${name}`]: {
                config: { path: `${options.mountPath}/${route}` },
              },
            })),
          }
        : {}),
    },
    backend: {
      baseUrl,
      listen: { port, host: '127.0.0.1' },
      database: { client: 'better-sqlite3', connection: ':memory:' },
      ...(options.installedFrontend
        ? {
            auth: {
              externalAccess: [
                {
                  type: 'static',
                  options: {
                    token: 'radius-installed-host-fixture',
                    subject: 'qualification-host',
                  },
                  accessRestrictions: [{ plugin: 'kubernetes' }],
                },
              ],
            },
          }
        : {}),
    },
    auth: {
      providers: { guest: { dangerouslyAllowOutsideDevelopment: true } },
    },
    catalog: { locations: [] },
    kubernetes: {
      serviceLocatorMethod: { type: 'multiTenant' },
      clusterLocatorMethods: [{ type: 'config', clusters }],
    },
  };
}

function isAddressInUse(error: unknown): boolean {
  let current = error;
  while (current && typeof current === 'object') {
    if ('code' in current && current.code === 'EADDRINUSE') return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

export async function startTestBackend(
  clusters: TestCluster[],
  options: TestHostOptions = {},
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP address for the test backend');
    }
    const { port } = address;
    await new Promise<void>((resolve, reject) => {
      reservation.close(error => (error ? reject(error) : resolve()));
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const backend = (options.backendFactory ?? createRadiusBackend)();
    backend.add(mockServices.rootLogger.factory({ level: 'error' }));
    backend.add(
      mockServices.rootConfig.factory({
        data: testBackendConfig(clusters, port, options),
      }),
    );

    try {
      await backend.start();
      return { backend, baseUrl };
    } catch (error) {
      try {
        await backend.stop();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Backend startup and cleanup failed',
        );
      }
      if (!isAddressInUse(error) || attempt === 4) throw error;
    }
  }

  throw new Error('Could not start the test backend after port conflicts');
}

export async function qualifyMissingBackendService(
  backendFactory = createRadiusBackend,
) {
  await assert.rejects(
    startTestBackend([], {
      backendFactory() {
        const backend = backendFactory();
        backend.add(
          createBackendPlugin({
            pluginId: 'qualification-missing-service',
            register(env) {
              env.registerInit({
                deps: {
                  required: createServiceRef({
                    id: 'qualification.required',
                    scope: 'root',
                  }),
                },
                async init() {
                  throw new Error(
                    'Missing service must prevent initialization',
                  );
                },
              });
            },
          }),
        );
        return backend;
      },
    }),
    /qualification.required/,
  );
  return { result: 'passed', missingService: 'qualification.required' };
}
