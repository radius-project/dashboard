import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const revisionLabel = 'org.opencontainers.image.revision';
const root = fileURLToPath(new URL('..', import.meta.url));
const waitForConfiguration =
  "const fs=require('node:fs');const {spawn}=require('node:child_process');const path='/tmp/qualification.json';const poll=setInterval(()=>{let config;try{config=JSON.parse(fs.readFileSync(path,'utf8'))}catch{}if(config?.app?.baseUrl){clearInterval(poll);const child=spawn(process.execPath,['packages/backend','--config',path],{stdio:'inherit'});child.on('error',error=>{console.error(error);process.exit(1)});child.on('exit',code=>process.exit(code??1))}},50)";

function command(name: string, args: string[]) {
  const result = spawnSync(name, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${name} ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

const docker = (...args: string[]) => command('docker', args);

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

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
  if (image.includes('@sha256:')) {
    docker('pull', '--platform', 'linux/amd64', '--quiet', image);
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

  const directory = await mkdtemp(join(tmpdir(), 'radius-rollback-'));
  // The restored image runs the journeys from its own revision. They stay under the
  // repository so that their @playwright/test import resolves.
  await mkdir(join(root, 'logs'), { recursive: true });
  const previousJourneys = await mkdtemp(join(root, 'logs', 'rollback-'));
  try {
    const archive = join(directory, 'previous-e2e.tar');
    command('git', [
      'archive',
      '--output',
      archive,
      previousRevision,
      'packages/app/e2e-tests',
    ]);
    command('tar', ['-xf', archive, '-C', previousJourneys]);
    const previousConfig = join(previousJourneys, 'playwright.config.ts');
    await writeFile(
      previousConfig,
      `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './packages/app/e2e-tests',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  outputDir: './results',
  use: { baseURL: process.env.PLAYWRIGHT_URL, channel: 'chromium', screenshot: 'only-on-failure' },
});
`,
    );
    const network = docker(
      'network',
      'create',
      `radius-rollback-${process.pid}`,
    );
    const upstream = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.statusCode = request.url?.includes('/forbidden') ? 403 : 200;
      response.end(JSON.stringify({ value: [] }));
    });
    try {
      upstream.listen(0, '0.0.0.0');
      await once(upstream, 'listening');
      const upstreamAddress = upstream.address();
      if (!upstreamAddress || typeof upstreamAddress === 'string')
        throw new Error('Expected a TCP upstream address');
      const configuration = join(directory, 'qualification.json');
      await writeFile(configuration, '{}');
      for (const [label, image] of [
        ['candidate', candidate],
        ['restored', previous],
      ]) {
        let container: string | undefined;
        try {
          container = docker(
            'create',
            '--platform',
            'linux/amd64',
            '--network',
            network,
            '--add-host',
            'host.docker.internal:host-gateway',
            '--publish',
            '127.0.0.1::7007',
            '--mount',
            `type=bind,source=${configuration},target=/tmp/qualification.json,readonly`,
            '--env',
            'NODE_ENV=production',
            image,
            'node',
            '-e',
            waitForConfiguration,
          );
          docker('start', container);
          const port = docker(
            'inspect',
            '--format',
            '{{(index (index .NetworkSettings.Ports "7007/tcp") 0).HostPort}}',
            container,
          );
          if (!/^\d+$/.test(port))
            throw new Error(`Docker returned an invalid host port: ${port}`);
          const baseUrl = `http://127.0.0.1:${port}`;
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
                providers: {
                  guest: { dangerouslyAllowOutsideDevelopment: true },
                },
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
                        url: `http://host.docker.internal:${upstreamAddress.port}`,
                        authProvider: 'serviceAccount',
                        serviceAccountToken: 'standalone-test-token',
                      },
                    ],
                  },
                ],
              },
            }),
          );
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
              ...(label === 'restored' ? ['--config', previousConfig] : []),
            ],
            {
              stdio: 'inherit',
              env: {
                ...process.env,
                PLAYWRIGHT_URL: baseUrl,
                PLAYWRIGHT_DISABLE_WEBSERVER: 'true',
                PLAYWRIGHT_BROWSER_CHANNEL: 'chromium',
                STANDALONE_QUALIFICATION: 'true',
              },
            },
          );
          if (result.error) throw result.error;
          if (result.status !== 0)
            throw new Error(`${label} journeys failed (${result.status})`);
        } catch (error) {
          const containerId = container;
          if (containerId)
            bestEffort(() => console.error(docker('logs', containerId)));
          throw error;
        } finally {
          const containerId = container;
          if (containerId)
            bestEffort(() => docker('rm', '--force', containerId));
        }
      }
    } finally {
      if (upstream.listening) await close(upstream);
      bestEffort(() => docker('network', 'rm', network));
    }
  } finally {
    await rm(previousJourneys, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
