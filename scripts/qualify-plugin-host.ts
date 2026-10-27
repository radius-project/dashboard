import { createServer } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect, type Browser } from '@playwright/test';

async function main() {
  const consumerRoot = process.argv[2];
  if (!consumerRoot)
    throw new Error('Expected the isolated packed consumer path');
  const fixtureRoot = path.join(consumerRoot, 'fixture');
  const output = path.join(consumerRoot, 'browser');
  fs.cpSync(
    path.join(process.cwd(), 'plugins', 'plugin-radius', 'fixtures'),
    fixtureRoot,
    { recursive: true },
  );
  const bundle = await build({
    entryPoints: {
      native: path.join(fixtureRoot, 'native.tsx'),
      legacy: path.join(fixtureRoot, 'legacy.tsx'),
    },
    outdir: output,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    nodePaths: [path.join(process.cwd(), 'node_modules')],
    define: {
      'process.env': JSON.stringify({ NODE_ENV: 'production' }),
      global: 'globalThis',
    },
    loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    metafile: true,
    logLevel: 'warning',
  });
  const inputs = Object.keys(bundle.metafile.inputs);
  if (
    !inputs.some(input => input.includes('plugin-radius/dist/alpha.esm.js')) ||
    !inputs.some(input => input.includes('plugin-radius/dist/index.esm.js')) ||
    inputs.some(input => input.includes('plugin-radius/src/'))
  ) {
    throw new Error(
      'Browser fixtures must use both packed entries, not workspace source',
    );
  }
  const applicationId =
    '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/applications/packed-app';
  const environmentId =
    '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/environments/demo';
  const application = {
    id: applicationId,
    name: 'packed-app',
    type: 'Applications.Core/applications',
    properties: { environment: environmentId },
  };
  const environment = {
    id: environmentId,
    name: 'demo',
    type: 'Applications.Core/environments',
    properties: {},
  };
  const graph = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        'packages',
        'app',
        'e2e-tests',
        'fixtures',
        'multi-tier.json',
      ),
      'utf8',
    ),
  );
  let system = 'legacy';
  const server = createServer((request, response) => {
    const asset = new URL(
      request.url ?? '/',
      'http://localhost',
    ).pathname.slice(1);
    if (/^[a-zA-Z0-9_.-]+\.(js|css)$/.test(asset)) {
      const file = path.join(output, asset);
      if (!fs.existsSync(file)) {
        response.writeHead(404).end('Missing fixture asset');
        return;
      }
      response.setHeader(
        'content-type',
        asset.endsWith('.css') ? 'text/css' : 'text/javascript',
      );
      response.end(fs.readFileSync(file));
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(
      `<!doctype html><html><head><link rel="stylesheet" href="/${system}.css"></head><body><div id="root"></div><script type="module" src="/${system}.js"></script></body></html>`,
    );
  });
  let browser: Browser | undefined;
  const failures: unknown[] = [];
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP fixture server');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL
        ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL }
        : {}),
    });
    for (system of ['legacy', 'native']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('dialog', dialog => dialog.accept());
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/kubernetes/**', async route => {
        const url = decodeURIComponent(route.request().url());
        let json: unknown = { value: [] };
        if (url.endsWith('/clusters'))
          json = {
            items: [{ name: 'packed-cluster', authProvider: 'serviceAccount' }],
          };
        else if (url.includes('/getGraph?')) json = graph;
        else if (url.includes('/resourceTypes/applications?'))
          json = {
            Name: 'applications',
            Description: 'Applications',
            ResourceProviderNamespace: 'Applications.Core',
            APIVersions: { '2025-01-01': {} },
            APIVersionList: ['2025-01-01'],
          };
        else if (url.includes(`${applicationId}?`)) json = application;
        else if (url.includes(`${environmentId}?`)) json = environment;
        else if (url.includes('/Applications.Core/applications?'))
          json = { value: [application] };
        else if (url.includes('/Applications.Core/environments?'))
          json = { value: [environment] };
        await route.fulfill({ json });
      });
      for (const basePath of ['', '/nested']) {
        for (const [route, title] of [
          ['/applications', 'Applications'],
          ['/environments', 'Environments'],
          ['/recipes', 'Recipes'],
          ['/resources', 'Resources'],
          ['/resource-types', 'Resource Types'],
          ['/resource-types/Applications.Core/applications', 'applications'],
          [
            '/resources/demo/Applications.Core/applications/packed-app/overview',
            'Resource',
          ],
          [
            '/environments/demo/Applications.Core/environments/demo/overview',
            'Environment',
          ],
        ]) {
          await page.goto(`${origin}${basePath}${route}`);
          if (
            system === 'native' &&
            basePath === '' &&
            route === '/applications'
          ) {
            const enter = page.getByRole('button', {
              name: 'Enter',
              exact: true,
            });
            await expect(enter).toBeVisible();
            await enter.click();
          }
          await expect(
            page.getByRole('heading', { name: title, level: 1 }),
          ).toBeVisible({ timeout: 15_000 });
        }
        await page.goto(`${origin}${basePath}/applications`);
        await page.getByRole('link', { name: 'packed-app' }).click();
        await page.getByRole('tab', { name: 'App Graph' }).click();
        await expect(
          page.getByRole('button', { name: /^frontend/ }),
        ).toBeVisible({ timeout: 15_000 });
        await page.reload();
        await expect(
          page.getByRole('button', { name: /^frontend/ }),
        ).toBeVisible({ timeout: 15_000 });
        await page.goBack();
        await expect(
          page.getByRole('heading', { name: 'Resource', level: 1 }),
        ).toBeVisible();
      }
      expect(errors).toEqual([]);
      await context.close();
      console.log(
        `FS-03/08 PASS: packed ${system}, eight pages, nested paths, real graph, refresh and history`,
      );
    }
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await browser?.close();
    } catch (error) {
      failures.push(error);
    }
    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        });
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      'Packed host qualification and cleanup failed',
    );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
