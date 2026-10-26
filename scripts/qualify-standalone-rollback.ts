import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

function docker(...args: string[]) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function main() {
  const [previous, candidate] = process.argv.slice(2);
  if (
    !previous?.match(/@sha256:[0-9a-f]{64}$/) ||
    !candidate?.match(/^sha256:[0-9a-f]{64}$/)
  ) {
    throw new Error(
      'Supply the previous registry image digest and candidate local image ID',
    );
  }
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  const { port } = address;
  await new Promise<void>((resolve, reject) =>
    reservation.close(error => (error ? reject(error) : resolve())),
  );
  const baseUrl = `http://127.0.0.1:${port}`;
  const directory = await mkdtemp(join(tmpdir(), 'radius-rollback-'));
  const network = docker('network', 'create', `radius-rollback-${process.pid}`);
  let upstream: string | undefined;
  try {
    upstream = docker(
      'run',
      '--detach',
      '--rm',
      '--platform',
      'linux/amd64',
      '--network',
      network,
      '--network-alias',
      'qualification-upstream',
      previous,
      'node',
      '-e',
      "require('http').createServer((q,s)=>{s.setHeader('content-type','application/json');s.statusCode=q.url.includes('/forbidden')?403:200;s.end(JSON.stringify({value:[]}));}).listen(8080,'0.0.0.0')",
    );
    const configuration = join(directory, 'qualification.json');
    await writeFile(
      configuration,
      JSON.stringify({
        app: {
          baseUrl,
          title: 'Radius Dashboard',
          packageName: '@internal/app',
        },
        backend: {
          baseUrl,
          listen: { port: 7007, host: '0.0.0.0' },
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
              clusters: [
                {
                  name: 'standalone-test-cluster',
                  url: 'http://qualification-upstream:8080',
                  authProvider: 'serviceAccount',
                  serviceAccountToken: 'standalone-test-token',
                },
              ],
            },
          ],
        },
      }),
    );
    for (const [label, image] of [
      ['candidate', candidate],
      ['restored', previous],
    ]) {
      const container = docker(
        'run',
        '--detach',
        '--rm',
        '--platform',
        'linux/amd64',
        '--network',
        network,
        '--publish',
        `127.0.0.1:${port}:7007`,
        '--mount',
        `type=bind,source=${configuration},target=/tmp/qualification.json,readonly`,
        '--env',
        'NODE_ENV=production',
        image,
        'node',
        'packages/backend',
        '--config',
        '/tmp/qualification.json',
      );
      try {
        let ready = false;
        for (let attempt = 0; attempt < 120; attempt++) {
          try {
            const response = await fetch(baseUrl, {
              signal: AbortSignal.timeout(2_000),
            });
            ready =
              response.ok &&
              (await response.text()).includes('<div id="root">');
          } catch (error) {
            if (
              !(error instanceof TypeError) &&
              !(error instanceof DOMException)
            )
              throw error;
          }
          if (ready) break;
          await new Promise(resolve => setTimeout(resolve, 1_000));
        }
        if (!ready) throw new Error(`${label} image did not become ready`);
        console.log(`Qualifying ${label}: ${image} at ${baseUrl}`);
        const require = createRequire(import.meta.url);
        const result = spawnSync(
          process.execPath,
          [
            require.resolve('@playwright/test/cli'),
            'test',
            '--workers=1',
            '--reporter=line',
            ...(label === 'restored'
              ? ['app.test.ts', 'radiusGraph.test.ts']
              : []),
          ],
          {
            stdio: 'inherit',
            env: {
              ...process.env,
              PLAYWRIGHT_URL: baseUrl,
              PLAYWRIGHT_DISABLE_WEBSERVER: 'true',
              PLAYWRIGHT_BROWSER_CHANNEL: 'chromium',
              STANDALONE_QUALIFICATION: 'true',
              STANDALONE_ROLLBACK: label === 'restored' ? 'true' : '',
            },
          },
        );
        if (result.error) throw result.error;
        if (result.status !== 0)
          throw new Error(`${label} journeys failed (${result.status})`);
      } catch (error) {
        console.error(docker('logs', container));
        throw error;
      } finally {
        docker('stop', container);
      }
    }
  } finally {
    try {
      if (upstream) docker('stop', upstream);
    } finally {
      docker('network', 'rm', network);
      await rm(directory, { recursive: true });
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
