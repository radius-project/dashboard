import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const revisionLabel = 'org.opencontainers.image.revision';

function command(name: string, args: string[]) {
  const result = spawnSync(name, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${name} ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

const docker = (...args: string[]) => command('docker', args);

function bestEffort(action: () => void) {
  try {
    action();
  } catch (error) {
    console.error(error);
  }
}

// Binds a tested image to the source revision and lockfile recorded for the tuple.
function verifyTuple(label: string, image: string, revision: string) {
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(`${label} revision must be a full Git commit ID`);
  }
  const actualRevision = docker(
    'image',
    'inspect',
    image,
    '--format',
    `{{index .Config.Labels "${revisionLabel}"}}`,
  );
  if (actualRevision !== revision) {
    throw new Error(
      `${label} image revision is ${actualRevision}, expected ${revision}`,
    );
  }
  const expectedLock = command('git', ['rev-parse', `${revision}:yarn.lock`]);
  const actualLock = docker(
    'run',
    '--rm',
    '--platform',
    'linux/amd64',
    '--network',
    'none',
    image,
    'node',
    '-e',
    "const b=require('fs').readFileSync('yarn.lock');process.stdout.write(require('crypto').createHash('sha1').update('blob '+b.length+'\\0').update(b).digest('hex'))",
  );
  if (actualLock !== expectedLock) {
    throw new Error(
      `${label} image lockfile is ${actualLock}, expected ${expectedLock}`,
    );
  }
  console.log(
    `Verified ${label}: ${image}, revision ${revision}, lockfile ${actualLock}`,
  );
}

async function main() {
  const [previous, previousRevision, candidate, candidateRevision] =
    process.argv.slice(2);
  if (
    !previous?.match(/@sha256:[0-9a-f]{64}$/) ||
    !candidate?.match(/^(?:sha256:[0-9a-f]{64}|.+@sha256:[0-9a-f]{64})$/)
  ) {
    throw new Error(
      'Usage: <previous image@digest> <previous revision> <candidate image ID or image@digest> <candidate revision>',
    );
  }
  verifyTuple('candidate', candidate, candidateRevision);
  verifyTuple('previous', previous, previousRevision);

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
  try {
    const network = docker(
      'network',
      'create',
      `radius-rollback-${process.pid}`,
    );
    let upstream: string | undefined;
    try {
      upstream = docker(
        'run',
        '--detach',
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
        // Without --rm, logs remain available if startup fails.
        const container = docker(
          'run',
          '--detach',
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
          bestEffort(() => console.error(docker('logs', container)));
          throw error;
        } finally {
          bestEffort(() => docker('rm', '--force', container));
        }
      }
    } finally {
      if (upstream) {
        const id = upstream;
        bestEffort(() => docker('rm', '--force', id));
      }
      bestEffort(() => docker('network', 'rm', network));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
