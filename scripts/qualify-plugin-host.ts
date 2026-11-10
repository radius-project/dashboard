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
  for (const entry of ['native', 'legacy']) {
    const outputs = bundle.metafile.outputs;
    const start = Object.keys(outputs).find(
      file => path.resolve(file) === path.join(output, `${entry}.js`),
    );
    if (!start) throw new Error(`Missing packed ${entry} output`);
    const visited = new Set<string>();
    const visit = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);
      const metadata = outputs[file];
      if (!metadata) throw new Error(`Missing bundled output ${file}`);
      if (
        Object.keys(metadata.inputs).some(input =>
          /node_modules\/(?:reactflow|@reactflow)\//.test(
            input.replaceAll('\\', '/'),
          ),
        )
      ) {
        throw new Error(
          `Packed ${entry} plugin must not include legacy Flow11`,
        );
      }
      for (const dependency of metadata.imports.filter(
        item => !item.external,
      )) {
        const target = Object.keys(outputs).find(
          candidate =>
            path.resolve(candidate) ===
              path.resolve(path.dirname(file), dependency.path) ||
            path.resolve(candidate) === path.resolve(dependency.path),
        );
        if (!target)
          throw new Error(
            `Cannot trace packed output dependency ${dependency.path}`,
          );
        visit(target);
      }
    };
    visit(start);
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
      await page.setViewportSize({ width: 1500, height: 1200 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => {
        errors.push(`Unexpected dialog: ${dialog.message()}`);
        await dialog.dismiss();
      });
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
          await expect(
            page.getByRole('heading', { name: title, level: 1 }),
          ).toBeVisible({ timeout: 15_000 });
        }
        await page.goto(`${origin}${basePath}/applications`);
        await page.getByRole('link', { name: 'packed-app' }).click();
        await page.getByRole('tab', { name: 'App Graph' }).click();
        await expect(
          page.getByRole('group', { name: 'frontend', exact: true }),
        ).toBeVisible({ timeout: 15_000 });
        await page
          .getByRole('button', { name: 'Fit View', exact: true })
          .click();
        await expect
          .poll(() =>
            page.locator('.react-flow').evaluate(flow => {
              const viewport = flow.getBoundingClientRect();
              return Array.from(
                flow.querySelectorAll('.react-flow__node'),
              ).every(node => {
                const box = node.getBoundingClientRect();
                return (
                  box.width > 0 &&
                  box.height > 0 &&
                  box.left >= viewport.left &&
                  box.top >= viewport.top &&
                  box.right <= viewport.right &&
                  box.bottom <= viewport.bottom
                );
              });
            }),
          )
          .toBe(true);
        for (const name of ['frontend', 'backend', 'edge', 'cache']) {
          await expect(
            page.getByRole('group', { name, exact: true }),
          ).toBeInViewport({ ratio: 0.99999 });
        }
        const viewport = page.locator('.react-flow__viewport');
        const fitted = await viewport.getAttribute('style');
        const zoomLevel = () =>
          viewport.evaluate(
            element => new DOMMatrix(getComputedStyle(element).transform).a,
          );
        const fittedZoom = await zoomLevel();
        await page
          .getByRole('button', { name: 'Zoom In', exact: true })
          .click();
        await expect(viewport).not.toHaveAttribute('style', fitted ?? '');
        await expect.poll(zoomLevel).toBeGreaterThan(fittedZoom + 0.01);
        const zoomedIn = await zoomLevel();
        await page
          .getByRole('button', { name: 'Zoom Out', exact: true })
          .click();
        await expect.poll(zoomLevel).toBeLessThan(zoomedIn);
        const zoomedOut = await zoomLevel();
        await page
          .getByRole('button', { name: 'Fit View', exact: true })
          .click();
        await expect
          .poll(() =>
            page.locator('.react-flow__node').evaluateAll(
              nodes =>
                nodes.length === 4 &&
                nodes.every(node => {
                  const box = node.getBoundingClientRect();
                  return (
                    box.top >= 0 &&
                    box.left >= 0 &&
                    box.right <= window.innerWidth &&
                    box.bottom <= window.innerHeight
                  );
                }),
            ),
          )
          .toBe(true);
        const evidenceDirectory = process.env.QUALIFICATION_EVIDENCE_DIRECTORY;
        if (evidenceDirectory && basePath === '') {
          fs.mkdirSync(evidenceDirectory, { recursive: true });
          await page.screenshot({
            path: path.join(evidenceDirectory, `${system}-multi-tier.png`),
            fullPage: true,
            animations: 'disabled',
          });
          await page.locator('.react-flow').screenshot({
            path: path.join(
              evidenceDirectory,
              `${system}-multi-tier-complete-graph.png`,
            ),
            animations: 'disabled',
          });
          const record = await page.evaluate(() => ({
            nodes: Array.from(document.querySelectorAll('.react-flow__node'))
              .map(element => {
                const card = element.querySelector('[data-node-id]') ?? element;
                return {
                  id: element.getAttribute('data-id'),
                  label: (
                    card.querySelector('[data-radius-part="node-title"], h3')
                      ?.textContent ?? ''
                  ).trim(),
                  typeText: (
                    card.querySelector('[data-radius-part="node-type"], h6')
                      ?.textContent ?? ''
                  ).trim(),
                  rawType: card.getAttribute('data-radius-resource-type'),
                  icon: card.getAttribute('data-radius-icon'),
                  badge: card.getAttribute('data-radius-badge'),
                  provisioning: card.getAttribute('data-radius-provisioning'),
                };
              })
              .sort((left, right) =>
                (left.id ?? '').localeCompare(right.id ?? ''),
              ),
            edges: Array.from(document.querySelectorAll('.react-flow__edge'))
              .map(element => {
                const id = element.getAttribute('data-id');
                if (id?.startsWith('[')) {
                  const [source, target] = JSON.parse(id) as [string, string];
                  return { source, target };
                }
                const label = element.getAttribute('aria-label') ?? '';
                const match = /^Edge from (.*?) to (.*)$/.exec(label);
                if (!match)
                  throw new Error(
                    'Rendered edge has no observable directed identity',
                  );
                return { source: match[1], target: match[2] };
              })
              .sort((left, right) =>
                JSON.stringify(left).localeCompare(JSON.stringify(right)),
              ),
          }));
          fs.writeFileSync(
            path.join(evidenceDirectory, `${system}-multi-tier.json`),
            `${JSON.stringify(record, null, 2)}\n`,
          );
          const visibility = await page.evaluate(() => {
            const bounds = (element: Element) => {
              const { left, top, right, bottom, width, height } =
                element.getBoundingClientRect();
              return { left, top, right, bottom, width, height };
            };
            const flow = document.querySelector('.react-flow');
            if (!flow) throw new Error('Missing rendered graph');
            return {
              viewport: { width: innerWidth, height: innerHeight },
              graph: bounds(flow),
              nodes: Array.from(
                document.querySelectorAll('.react-flow__node'),
                element => ({
                  id: element.getAttribute('data-id'),
                  ...bounds(element),
                }),
              ),
            };
          });
          fs.writeFileSync(
            path.join(
              evidenceDirectory,
              `${system}-multi-tier-interactions.json`,
            ),
            `${JSON.stringify(
              { fittedZoom, zoomedIn, zoomedOut, ...visibility },
              null,
              2,
            )}\n`,
          );
        }
        await page.reload();
        await expect(
          page.getByRole('group', { name: 'frontend', exact: true }),
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
