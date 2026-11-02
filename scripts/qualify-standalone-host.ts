import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { startTestBackend } from '../packages/backend/testUtils.ts';

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

async function main() {
  const upstream = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url?.includes('/forbidden')) {
      response
        .writeHead(403)
        .end(
          JSON.stringify({ message: 'Upstream policy denied this request' }),
        );
      return;
    }
    response.end(JSON.stringify({ value: [] }));
  });
  const upstreamPort = await listen(upstream);
  let backend:
    Awaited<ReturnType<typeof startTestBackend>>['backend'] | undefined;
  try {
    const started = await startTestBackend([
      {
        name: 'standalone-test-cluster',
        url: `http://127.0.0.1:${upstreamPort}`,
        authProvider: 'serviceAccount',
        serviceAccountToken: 'standalone-test-token',
      },
    ]);
    backend = started.backend;
    const { baseUrl } = started;
    const response = await fetch(baseUrl);
    if (!response.ok || !(await response.text()).includes('<div id="root">')) {
      throw new Error('The real backend must serve the built standalone app');
    }
    const require = createRequire(import.meta.url);
    const child = spawn(
      process.execPath,
      [
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
    if (code !== 0)
      throw new Error(`Standalone browser qualification failed (${code})`);
  } finally {
    await backend?.stop();
    await close(upstream);
  }
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  },
);
