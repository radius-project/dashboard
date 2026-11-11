import assert from 'node:assert/strict';
import type { TestCluster } from './testUtils.ts';

export interface ObservedProxyRequest {
  method: string;
  url: string;
  authorization?: string;
}

export async function qualifyBackendConnections(options: {
  baseUrl: string;
  clusters: TestCluster[];
  requests: ObservedProxyRequest[];
  denyConnection(name?: string): void;
}) {
  const { baseUrl, clusters, requests, denyConnection } = options;
  assert.ok(clusters.length >= 2, 'Connection isolation needs two connections');
  const signIn = await fetch(`${baseUrl}/api/auth/guest/refresh`);
  assert.equal(signIn.status, 200);
  const token: unknown = (await signIn.json()).backstageIdentity.token;
  assert.equal(typeof token, 'string', 'Host sign-in must return a token');
  const authorization = `Bearer ${token}`;
  const discovered = await fetch(`${baseUrl}/api/kubernetes/clusters`, {
    headers: { authorization },
  });
  assert.equal(discovered.status, 200);
  const discovery: { items: { name: string }[] } = await discovered.json();
  assert.deepEqual(
    Array.from(discovery.items, item => item.name).sort(),
    clusters.map(cluster => cluster.name).sort(),
  );
  assert.equal(
    (
      await fetch(`${baseUrl}/api/catalog/entities`, {
        headers: { authorization },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${baseUrl}/api/radius/health`, {
        headers: { authorization },
      })
    ).status,
    404,
  );
  const cases: {
    connection: string;
    method: string;
    auth: string;
    policy: string;
    status: number;
    forwarded: number;
  }[] = [];
  const selectedDenial = clusters[1].name;
  try {
    for (const policy of ['allowed', 'selected-denied']) {
      denyConnection(policy === 'selected-denied' ? selectedDenial : undefined);
      for (const cluster of clusters) {
        for (const method of ['GET', 'POST']) {
          for (const auth of ['missing', 'invalid', 'host']) {
            const count = requests.length;
            const suffix = `/apis/api.ucp.dev/v1alpha3/planes/radius/local/${method === 'POST' ? 'getGraph' : 'resourceGroups'}?api-version=2023-10-01-preview`;
            const response = await fetch(
              `${baseUrl}/api/kubernetes/proxy${suffix}`,
              {
                method,
                headers: {
                  'Backstage-Kubernetes-Cluster': cluster.name,
                  ...(auth === 'missing'
                    ? {}
                    : {
                        authorization:
                          auth === 'host'
                            ? authorization
                            : 'Bearer invalid-qualification-token',
                      }),
                  ...(method === 'POST'
                    ? { 'content-type': 'application/json' }
                    : {}),
                },
                ...(method === 'POST' ? { body: '{}' } : {}),
              },
            );
            await response.arrayBuffer();
            let expected = auth === 'host' ? 200 : 401;
            if (
              auth === 'host' &&
              policy === 'selected-denied' &&
              cluster.name === selectedDenial
            ) {
              expected = 403;
            }
            assert.equal(
              response.status,
              expected,
              `${policy} ${cluster.name} ${method} ${auth}`,
            );
            assert.deepEqual(
              requests.slice(count),
              auth === 'host'
                ? [
                    {
                      method,
                      url: `${new URL(cluster.url).pathname.replace(/\/$/, '')}${suffix}`,
                      authorization: `Bearer ${cluster.serviceAccountToken}`,
                    },
                  ]
                : [],
              'Only the selected connection may receive the request and its own credential',
            );
            cases.push({
              connection: cluster.name,
              method,
              auth,
              policy,
              status: response.status,
              forwarded: requests.length - count,
            });
          }
        }
      }
    }
  } finally {
    denyConnection();
  }
  return {
    result: 'passed',
    cases,
    initialized: ['auth', 'catalog', 'kubernetes'],
    radiusScaffold: false,
  };
}
