import { createServer } from 'node:http';
import { once } from 'node:events';
import { mockServices } from '@backstage/backend-test-utils';
import { createRadiusBackend } from './src/createRadiusBackend.ts';

export interface TestCluster {
  name: string;
  url: string;
  authProvider: 'serviceAccount';
  serviceAccountToken: string;
}

function isAddressInUse(error: unknown): boolean {
  let current = error;
  while (current && typeof current === 'object') {
    if ('code' in current && current.code === 'EADDRINUSE') return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

export async function startTestBackend(clusters: TestCluster[]) {
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
    const backend = createRadiusBackend();
    backend.add(mockServices.rootLogger.factory({ level: 'error' }));
    backend.add(
      mockServices.rootConfig.factory({
        data: {
          app: {
            baseUrl,
            title: 'Radius Dashboard',
            packageName: '@internal/app',
          },
          backend: {
            baseUrl,
            listen: { port, host: '127.0.0.1' },
            database: { client: 'better-sqlite3', connection: ':memory:' },
          },
          auth: {
            providers: { guest: { dangerouslyAllowOutsideDevelopment: true } },
          },
          catalog: { locations: [] },
          kubernetes: {
            serviceLocatorMethod: { type: 'multiTenant' },
            clusterLocatorMethods: [{ type: 'config', clusters }],
          },
        },
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
