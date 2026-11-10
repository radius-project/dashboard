import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { radiusFixtureResponse } from './qualification-fixture.ts';
import {
  startTestBackend,
  testBackendConfig,
  type TestCluster,
} from '../packages/backend/testUtils.ts';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP server');
  return address.port;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function startContainer(image: string, clusters: TestCluster[]) {
  const evidence = process.env.QUALIFICATION_EVIDENCE_DIRECTORY;
  if (!evidence || !path.isAbsolute(evidence)) {
    throw new Error(
      'Container qualification requires an absolute QUALIFICATION_EVIDENCE_DIRECTORY',
    );
  }
  fs.mkdirSync(evidence, { recursive: true });
  const directory = fs.mkdtempSync(path.join(evidence, 'container-host-'));
  const reservation = createServer();
  const port = await listen(reservation);
  await close(reservation);
  const config = path.join(directory, 'app-config.json');
  const configuration = testBackendConfig(
    clusters,
    port,
    Boolean(process.env.QUALIFICATION_INSTALLED_CONSUMER),
  );
  fs.writeFileSync(config, `${JSON.stringify(configuration, null, 2)}\n`);
  const name = `radius-qualification-${randomUUID()}`;
  const docker = (args: string[]) =>
    execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim();
  const inspected = JSON.parse(docker(['image', 'inspect', image]))[0];
  const args = [
    'run',
    '--detach',
    '--pull=never',
    '--network',
    'host',
    '--name',
    name,
    '--env',
    'NODE_ENV=production',
    '--mount',
    `type=bind,source=${config},target=/app/qualification.json,readonly`,
    image,
    'node',
    'packages/backend',
    '--config',
    'qualification.json',
  ];
  fs.writeFileSync(
    path.join(directory, 'image.json'),
    `${JSON.stringify(
      {
        image,
        id: inspected.Id,
        architecture: inspected.Architecture,
        labels: inspected.Config.Labels,
        command: ['docker', ...args],
        scope: process.env.QUALIFICATION_INSTALLED_CONSUMER
          ? 'installed external entries with real built container backend; not full Phase 5'
          : 'built container baseline; not full Phase 5 installed-host qualification',
      },
      null,
      2,
    )}\n`,
  );
  const baseUrl = `http://127.0.0.1:${port}`;
  let started = false;
  const stop = async () => {
    const failures: unknown[] = [];
    try {
      const logs = spawnSync('docker', ['logs', name], {
        encoding: 'utf8',
        timeout: 30_000,
      });
      fs.writeFileSync(
        path.join(directory, 'backend.log'),
        `${logs.stdout ?? ''}${logs.stderr ?? ''}`,
      );
      if (logs.error) throw logs.error;
      if (logs.status !== 0)
        throw new Error(`Could not capture container logs (${logs.status})`);
    } catch (error) {
      failures.push(error);
    }
    try {
      docker(['rm', '--force', name]);
    } catch (error) {
      failures.push(error);
    }
    if (failures.length)
      throw new AggregateError(failures, 'Container cleanup failed');
  };
  try {
    const invalidConfig = path.join(directory, 'missing-service-config.json');
    fs.writeFileSync(
      invalidConfig,
      JSON.stringify({
        ...configuration,
        kubernetes: {
          clusterLocatorMethods: configuration.kubernetes.clusterLocatorMethods,
        },
      }),
    );
    const probeName = `${name}-startup-negative`;
    const probe = spawnSync(
      'docker',
      [
        'run',
        '--pull=never',
        '--network',
        'host',
        '--name',
        probeName,
        '--env',
        'NODE_ENV=production',
        '--mount',
        `type=bind,source=${invalidConfig},target=/app/qualification.json,readonly`,
        image,
        'node',
        'packages/backend',
        '--config',
        'qualification.json',
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    const probeLog = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
    fs.writeFileSync(path.join(directory, 'startup-negative.log'), probeLog);
    try {
      docker(['rm', '--force', probeName]);
    } catch (cleanupError) {
      if (probe.error)
        throw new AggregateError(
          [probe.error, cleanupError],
          'Startup probe and cleanup failed',
        );
      throw cleanupError;
    }
    if (probe.error) throw probe.error;
    if (
      probe.status === 0 ||
      !/Missing required config value.*kubernetes\.serviceLocatorMethod/.test(
        probeLog,
      )
    ) {
      throw new Error(
        'Production backend must reject missing Kubernetes service-locator configuration',
      );
    }
    fs.writeFileSync(
      path.join(directory, 'startup-negative.json'),
      JSON.stringify(
        {
          result: 'passed',
          exitCode: probe.status,
          scope:
            'missing Kubernetes initialization configuration; not all missing-service combinations',
        },
        null,
        2,
      ),
    );
    docker(args);
    started = true;
    const deadline = Date.now() + 90_000;
    for (;;) {
      if (
        docker(['inspect', '--format', '{{.State.Running}}', name]) !== 'true'
      ) {
        throw new Error(
          `Built backend exited before readiness; see ${directory}`,
        );
      }
      try {
        const response = await fetch(baseUrl, {
          signal: AbortSignal.timeout(2_000),
        });
        if (response.ok && (await response.text()).includes('<div id="root">'))
          break;
      } catch (error) {
        if (
          !(
            error instanceof TypeError &&
            error.cause &&
            typeof error.cause === 'object' &&
            'code' in error.cause &&
            error.cause.code === 'ECONNREFUSED'
          ) &&
          !(error instanceof Error && error.name === 'TimeoutError')
        )
          throw error;
      }
      if (Date.now() >= deadline)
        throw new Error(`Built backend readiness timed out; see ${directory}`);
      await setTimeout(250);
    }
    console.log(`Built-container evidence: ${directory}`);
    return { baseUrl, backend: { stop }, evidenceDirectory: directory };
  } catch (error) {
    fs.writeFileSync(path.join(directory, 'failure.txt'), `${String(error)}\n`);
    if (started) {
      try {
        await stop();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Container startup and cleanup failed',
        );
      }
    }
    throw error;
  }
}

async function main() {
  const consumer = process.env.QUALIFICATION_INSTALLED_CONSUMER;
  const image = process.env.QUALIFICATION_CONTAINER_IMAGE;
  if (consumer && !image)
    throw new Error(
      'Installed frontend/backend journeys require a built container image',
    );
  let forbidden: boolean | 'graph' = false;
  const upstreamRequests: { method: string; path: string; status: number }[] =
    [];
  const upstream = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (
      consumer &&
      request.method === 'POST' &&
      request.url === '/__qualification/forbidden'
    ) {
      const body: Buffer[] = [];
      for await (const chunk of request) body.push(Buffer.from(chunk));
      const value: unknown = JSON.parse(Buffer.concat(body).toString('utf8'));
      if (typeof value !== 'boolean' && value !== 'graph') {
        response
          .writeHead(400)
          .end('Expected a boolean or graph authorization policy');
        return;
      }
      forbidden = value;
      response.end('{}');
      return;
    }
    const status =
      consumer &&
      request.headers.authorization !== 'Bearer standalone-test-token'
        ? 401
        : forbidden === true ||
            (forbidden === 'graph' && request.url?.includes('/getGraph')) ||
            request.url?.includes('/forbidden')
          ? 403
          : 200;
    upstreamRequests.push({
      method: request.method ?? '',
      path: request.url ?? '',
      status,
    });
    if (status !== 200) {
      response.writeHead(status).end(
        JSON.stringify({
          message: 'Upstream policy denied access to Radius',
        }),
      );
      return;
    }
    response.end(
      JSON.stringify(
        consumer
          ? radiusFixtureResponse(decodeURIComponent(request.url ?? ''))
          : { value: [] },
      ),
    );
  });
  const upstreamPort = await listen(upstream);
  let backend: { stop(): Promise<void> } | undefined;
  const failures: unknown[] = [];
  try {
    const clusters: TestCluster[] = [
      {
        name: consumer ? 'packed-cluster' : 'standalone-test-cluster',
        url: `http://127.0.0.1:${upstreamPort}`,
        authProvider: 'serviceAccount',
        serviceAccountToken: 'standalone-test-token',
      },
    ];
    const started = image
      ? await startContainer(image, clusters)
      : await startTestBackend(clusters);
    backend = started.backend;
    const { baseUrl } = started;
    const response = await fetch(baseUrl);
    if (!response.ok || !(await response.text()).includes('<div id="root">')) {
      throw new Error('The real backend must serve the built standalone app');
    }
    const require = createRequire(import.meta.url);
    const child = spawn(
      process.execPath,
      consumer
        ? [
            path.join(process.cwd(), 'scripts', 'qualify-plugin-host.ts'),
            consumer,
            '--installed',
          ]
        : [
            require.resolve('@playwright/test/cli'),
            'test',
            '--workers=1',
            '--reporter=line',
            ...process.argv.slice(2),
          ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          ...(consumer
            ? {
                QUALIFICATION_BACKEND_URL: baseUrl,
                QUALIFICATION_UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`,
              }
            : {}),
          ...('evidenceDirectory' in started
            ? {
                QUALIFICATION_EVIDENCE_DIRECTORY: started.evidenceDirectory,
              }
            : {}),
          PLAYWRIGHT_URL: baseUrl,
          PLAYWRIGHT_DISABLE_WEBSERVER: 'true',
          PLAYWRIGHT_BROWSER_CHANNEL:
            process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chromium',
          STANDALONE_QUALIFICATION: 'true',
        },
      },
    );
    child.on('error', error => console.error(error));
    const [code] = await once(child, 'exit');
    if (
      'evidenceDirectory' in started &&
      typeof started.evidenceDirectory === 'string'
    ) {
      fs.writeFileSync(
        path.join(started.evidenceDirectory, 'journeys.json'),
        `${JSON.stringify(
          {
            suite: consumer
              ? 'installed external legacy/native shared journeys'
              : 'standalone baseline',
            result: code === 0 ? 'passed' : 'failed',
            upstreamRequests,
            phase5Complete: false,
          },
          null,
          2,
        )}\n`,
      );
    }
    if (code !== 0)
      throw new Error(`Standalone browser qualification failed (${code})`);
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await backend?.stop();
    } catch (error) {
      failures.push(error);
    }
    try {
      await close(upstream);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      'Standalone qualification and cleanup failed',
    );
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  },
);
