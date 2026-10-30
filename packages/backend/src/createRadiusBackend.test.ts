import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mockServices } from '@backstage/backend-test-utils';
import { createRadiusBackend } from './createRadiusBackend';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP address for the test server');
  }
  return address.port;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

function isAddressInUse(error: unknown): boolean {
  let current = error;
  while (current && typeof current === 'object') {
    if ('code' in current && current.code === 'EADDRINUSE') return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

describe('native backend composition', () => {
  let backend: ReturnType<typeof createRadiusBackend> | undefined;
  let upstream: Server;
  let baseUrl = '';
  let token: string;
  const requests: { method: string; url: string; authorization?: string }[] =
    [];

  beforeAll(async () => {
    upstream = createServer((request, response) => {
      requests.push({
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: request.headers.authorization,
      });
      response.setHeader('content-type', 'application/json');
      if (request.url?.includes('/forbidden')) {
        response.writeHead(403);
        response.end(
          JSON.stringify({ message: 'Upstream policy denied this request' }),
        );
      } else {
        response.end(JSON.stringify({ value: [] }));
      }
    });
    const upstreamPort = await listen(upstream);
    let started = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const reservation = createServer();
      const port = await listen(reservation);
      await close(reservation);
      const candidate = createRadiusBackend();
      candidate.add(mockServices.rootLogger.factory({ level: 'error' }));
      candidate.add(
        mockServices.rootConfig.factory({
          data: {
            app: {
              baseUrl: 'http://localhost:3000',
              title: 'Radius Dashboard',
              packageName: '@internal/app',
            },
            backend: {
              baseUrl: `http://127.0.0.1:${port}`,
              listen: { port, host: '127.0.0.1' },
              database: { client: 'better-sqlite3', connection: ':memory:' },
            },
            auth: {
              providers: { guest: { dangerouslyAllowOutsideDevelopment: true } },
            },
            catalog: { locations: [] },
            kubernetes: {
              serviceLocatorMethod: { type: 'multiTenant' },
              clusterLocatorMethods: [
                {
                  type: 'config',
                  clusters: ['one', 'two'].map(name => ({
                    name,
                    url: `http://127.0.0.1:${upstreamPort}/${name}`,
                    authProvider: 'serviceAccount',
                    serviceAccountToken: `test-cluster-${name}`,
                  })),
                },
              ],
            },
          },
        }),
      );
      try {
        await candidate.start();
        backend = candidate;
        baseUrl = `http://127.0.0.1:${port}`;
        started = true;
        break;
      } catch (error) {
        try {
          await candidate.stop();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Backend startup and cleanup failed',
          );
        }
        if (!isAddressInUse(error) || attempt === 4) throw error;
      }
    }
    if (!started) throw new Error('Backend startup failed after port conflicts');
    const signIn = await fetch(`${baseUrl}/api/auth/guest/refresh`);
    if (signIn.status !== 200)
      throw new Error(`Guest sign-in failed: ${signIn.status}`);
    const result = await signIn.json();
    token = result.backstageIdentity.token;
    if (typeof token !== 'string')
      throw new Error('Guest sign-in did not return a token');
  }, 60_000);

  afterAll(async () => {
    await backend?.stop();
    if (upstream?.listening) await close(upstream);
  });

  it('BS-01/04: initializes the real six-plugin host without the Radius scaffold', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const clusters = await fetch(`${baseUrl}/api/kubernetes/clusters`, {
      headers,
    });
    expect(clusters.status).toBe(200);
    expect(await clusters.json()).toMatchObject({
      items: [{ name: 'one' }, { name: 'two' }],
    });
    expect(
      (await fetch(`${baseUrl}/api/catalog/entities`, { headers })).status,
    ).toBe(200);
    expect(
      (await fetch(`${baseUrl}/api/radius/health`, { headers })).status,
    ).toBe(404);
  });

  it('BS-03: rejects unauthenticated requests before the upstream transport', async () => {
    const count = requests.length;
    const response = await fetch(
      `${baseUrl}/api/kubernetes/proxy/apis/api.ucp.dev/v1alpha3/planes/radius/local/resourceGroups`,
    );
    expect(response.status).toBe(401);
    expect(requests).toHaveLength(count);
  });

  it('BS-03: routes authenticated GET and graph POST to only the selected connection', async () => {
    for (const cluster of ['one', 'two']) {
      for (const method of ['GET', 'POST']) {
        const count = requests.length;
        const path = method === 'POST' ? '/getGraph' : '/resourceGroups';
        const response = await fetch(
          `${baseUrl}/api/kubernetes/proxy/apis/api.ucp.dev/v1alpha3/planes/radius/local${path}?api-version=2023-10-01-preview`,
          {
            method,
            headers: {
              authorization: `Bearer ${token}`,
              'Backstage-Kubernetes-Cluster': cluster,
              ...(method === 'POST'
                ? { 'content-type': 'application/json' }
                : {}),
            },
            ...(method === 'POST' ? { body: '{}' } : {}),
          },
        );
        expect(response.status).toBe(200);
        expect(requests.slice(count)).toEqual([
          {
            method,
            url: `/${cluster}/apis/api.ucp.dev/v1alpha3/planes/radius/local${path}?api-version=2023-10-01-preview`,
            authorization: `Bearer test-cluster-${cluster}`,
          },
        ]);
      }
    }
  }, 30_000);

  it('BS-03: keeps an upstream forbidden response distinct from missing authentication', async () => {
    const response = await fetch(`${baseUrl}/api/kubernetes/proxy/forbidden`, {
      headers: {
        authorization: `Bearer ${token}`,
        'Backstage-Kubernetes-Cluster': 'one',
      },
    });
    expect(response.status).toBe(403);
  });
});
