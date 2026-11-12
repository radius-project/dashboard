import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { startTestBackend } from '../testUtils';

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

describe('native backend composition', () => {
  let backend:
    Awaited<ReturnType<typeof startTestBackend>>['backend'] | undefined;
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
    const started = await startTestBackend(
      ['one', 'two'].map(name => ({
        name,
        url: `http://127.0.0.1:${upstreamPort}/${name}`,
        authProvider: 'serviceAccount' as const,
        serviceAccountToken: `test-cluster-${name}`,
      })),
    );
    backend = started.backend;
    baseUrl = started.baseUrl;
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
