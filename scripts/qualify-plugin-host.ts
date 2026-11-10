import { createServer } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, expect, type Browser } from '@playwright/test';
import { assertProductionInputs, sha256 } from './installed-host.ts';
import { radiusFixtureResponse as fixtureResponse } from './qualification-fixture.ts';

async function main() {
  const consumerRoot = process.argv[2];
  if (!consumerRoot)
    throw new Error('Expected the isolated packed consumer path');
  const fixtureRoot = path.join(consumerRoot, 'fixture');
  const output = path.join(consumerRoot, 'browser');
  const installed = process.argv.includes('--installed');
  const buildRoot = installed ? consumerRoot : process.cwd();
  const resolveBuildPath = (file: string) => path.resolve(buildRoot, file);
  fs.cpSync(
    path.join(process.cwd(), 'plugins', 'plugin-radius', 'fixtures'),
    fixtureRoot,
    { recursive: true },
  );
  const bundle = await build({
    absWorkingDir: buildRoot,
    entryPoints: {
      native: path.join(fixtureRoot, 'native.tsx'),
      legacy: path.join(fixtureRoot, 'legacy.tsx'),
    },
    outdir: output,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    nodePaths: installed ? [] : [path.join(process.cwd(), 'node_modules')],
    define: {
      'process.env': JSON.stringify({ NODE_ENV: 'production' }),
      global: 'globalThis',
    },
    loader: { '.svg': 'dataurl', '.png': 'dataurl' },
    metafile: true,
    logLevel: 'warning',
  });
  const inputs = Object.entries(bundle.metafile.inputs)
    // esbuild represents browser:false entries as empty virtual inputs.
    .filter(
      ([input, metadata]) =>
        !input.startsWith('(disabled):') || metadata.bytes !== 0,
    )
    .map(([input]) =>
      input === '<define:process.env>' ? input : resolveBuildPath(input),
    );
  if (installed) {
    fs.writeFileSync(
      path.join(output, 'metafile.json'),
      `${JSON.stringify(bundle.metafile, null, 2)}\n`,
    );
    assertProductionInputs(consumerRoot, inputs);
    for (const entry of ['legacy', 'native']) {
      if (
        !fs
          .readFileSync(path.join(output, `${entry}.css`), 'utf8')
          .includes('.react-flow')
      ) {
        throw new Error(
          `Missing shipped graph CSS in production ${entry} build`,
        );
      }
    }
  }
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
      file => resolveBuildPath(file) === path.join(output, `${entry}.js`),
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
            resolveBuildPath(candidate) ===
              path.resolve(
                path.dirname(resolveBuildPath(file)),
                dependency.path,
              ) ||
            resolveBuildPath(candidate) === resolveBuildPath(dependency.path),
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
  let system = 'legacy';
  let basePath = '';
  const mountPath = installed ? '/plugins/radius' : '';
  let forbidden: boolean | 'graph' = false;
  const requests: {
    system: string;
    method: string;
    path: string;
    cluster?: string;
    status: number;
  }[] = [];
  const backendUrl = process.env.QUALIFICATION_BACKEND_URL;
  const upstreamUrl = process.env.QUALIFICATION_UPSTREAM_URL;
  if (backendUrl && (!installed || !upstreamUrl)) {
    throw new Error(
      'Real backend journeys require installed mode and a controlled fake upstream',
    );
  }
  const setForbidden = async (value: boolean | 'graph') => {
    if (backendUrl) {
      const response = await fetch(`${upstreamUrl}/__qualification/forbidden`, {
        method: 'POST',
        body: JSON.stringify(value),
      });
      if (!response.ok)
        throw new Error('Could not set fake-upstream authorization policy');
    }
    forbidden = value;
  };
  const server = createServer(async (request, response) => {
    if (installed && request.url?.startsWith('/api/kubernetes/')) {
      if (backendUrl) {
        try {
          const body: Buffer[] = [];
          for await (const chunk of request) body.push(Buffer.from(chunk));
          const headers = new Headers();
          for (const name of [
            'authorization',
            'content-type',
            'backstage-kubernetes-cluster',
          ]) {
            const value = request.headers[name];
            if (typeof value === 'string') headers.set(name, value);
          }
          const upstream = await fetch(`${backendUrl}${request.url}`, {
            method: request.method,
            headers,
            ...(body.length ? { body: Buffer.concat(body) } : {}),
          });
          requests.push({
            system,
            method: request.method ?? '',
            path: request.url,
            cluster: headers.get('backstage-kubernetes-cluster') ?? undefined,
            status: upstream.status,
          });
          response.writeHead(upstream.status, {
            'content-type':
              upstream.headers.get('content-type') ?? 'application/json',
          });
          response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          console.error(error);
          response
            .writeHead(502)
            .end('Qualification ingress could not reach the real backend');
        }
        return;
      }
      const authenticated =
        request.headers.authorization ===
        'Bearer radius-installed-host-fixture';
      const cluster = request.headers['backstage-kubernetes-cluster'];
      const denied =
        forbidden === true ||
        (forbidden === 'graph' && request.url.includes('/getGraph'));
      const status = !authenticated ? 401 : denied ? 403 : 200;
      requests.push({
        system,
        method: request.method ?? '',
        path: request.url,
        cluster: typeof cluster === 'string' ? cluster : undefined,
        status,
      });
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          status === 200
            ? fixtureResponse(decodeURIComponent(request.url))
            : {
                error: {
                  name:
                    status === 401 ? 'AuthenticationError' : 'NotAllowedError',
                  message: 'Host policy denied access to Radius',
                },
              },
        ),
      );
      return;
    }
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
      `<!doctype html><html><head>${installed ? `<meta name="installed-host"><meta name="host-base-path" content="${basePath}"><meta name="plugin-mount-path" content="${mountPath}">` : ''}<link rel="stylesheet" href="/${system}.css"></head><body><div id="root"></div><script type="module" src="/${system}.js"></script></body></html>`,
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
      const navigate = async (url: string) => {
        await page.goto(url);
        if (installed) {
          await page
            .getByRole('button', {
              name: 'Sign in to qualification host',
              exact: true,
            })
            .click({ timeout: 15_000 });
        }
      };
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => {
        errors.push(`Unexpected dialog: ${dialog.message()}`);
        await dialog.dismiss();
      });
      if (!installed)
        await page.route('**/api/kubernetes/**', async route => {
          const url = decodeURIComponent(route.request().url());
          await route.fulfill({ json: fixtureResponse(url) });
        });
      try {
        for (basePath of installed ? ['', '/nested'] : ['']) {
          const prefix = `${basePath}${mountPath}`;
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
            await navigate(`${origin}${prefix}${route}`);
            await expect(
              page.getByRole('heading', { name: title, level: 1 }),
            ).toBeVisible({ timeout: 15_000 });
          }
          await navigate(`${origin}${prefix}/applications`);
          if (installed) {
            const nav = page.getByRole('navigation', {
              name: 'Host navigation',
            });
            for (const [name, route] of [
              ['Applications', '/applications'],
              ['Environments', '/environments'],
              ['Recipes', '/recipes'],
              ['Resources', '/resources'],
              ['Resource Types', '/resource-types'],
              ['External applications', '/applications'],
            ]) {
              const link = nav.getByRole('link', { name, exact: true });
              await expect(link).toHaveAttribute('href', `${prefix}${route}`);
              await link.click();
              await expect(page).toHaveURL(`${origin}${prefix}${route}`);
            }
          }
          await page.getByRole('link', { name: 'packed-app' }).click();
          await page.getByRole('tab', { name: 'App Graph' }).click();
          const graphUrl = page.url();
          await expect(
            page.getByRole('group', { name: 'frontend', exact: true }),
          ).toBeVisible({ timeout: 15_000 });
          if (installed) {
            await expect(page.locator('.react-flow__node')).toHaveCount(4);
            await expect(
              page.locator('[data-radius-part="node-title"]'),
            ).toHaveCount(4);
            await expect(page.locator('.react-flow__edge')).not.toHaveCount(0);
            await expect(page.locator('.react-flow__controls')).toHaveCSS(
              'position',
              'absolute',
            );
            await expect
              .poll(() =>
                page.evaluate(() =>
                  Array.from(document.styleSheets).some(
                    sheet =>
                      sheet.href?.endsWith('.css') &&
                      Array.from(sheet.cssRules).some(rule =>
                        rule.cssText.includes('.react-flow'),
                      ),
                  ),
                ),
              )
              .toBe(true);
          }
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
          const evidenceDirectory =
            process.env.QUALIFICATION_EVIDENCE_DIRECTORY;
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
                  const card =
                    element.querySelector('[data-node-id]') ?? element;
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
          if (installed)
            await page
              .getByRole('button', {
                name: 'Sign in to qualification host',
                exact: true,
              })
              .click();
          await expect(
            page.getByRole('group', { name: 'frontend', exact: true }),
          ).toBeVisible({ timeout: 15_000 });
          await page.goBack();
          await expect(
            page.getByRole('heading', { name: 'Resource', level: 1 }),
          ).toBeVisible();
          if (installed) {
            await setForbidden(true);
            try {
              await navigate(`${origin}${prefix}/applications`);
              await expect(
                page
                  .getByText(/Host policy denied access|403|Forbidden/)
                  .first(),
              ).toBeVisible();
              await expect(
                page.getByRole('link', { name: 'packed-app', exact: true }),
              ).toHaveCount(0);
              if (backendUrl) {
                for (const method of ['GET', 'POST']) {
                  const allowed = requests.find(
                    request =>
                      request.system === system &&
                      request.method === method &&
                      request.path.includes('/proxy/') &&
                      request.status === 200 &&
                      (method !== 'POST' ||
                        request.path.includes('/getGraph?')),
                  );
                  if (!allowed)
                    throw new Error(`Missing allowed ${method} proxy request`);
                  const denied = await fetch(`${origin}${allowed.path}`, {
                    method,
                    headers: {
                      authorization: 'Bearer radius-installed-host-fixture',
                      'backstage-kubernetes-cluster': 'packed-cluster',
                      'content-type': 'application/json',
                    },
                    ...(method === 'POST' ? { body: '{}' } : {}),
                  });
                  expect(denied.status).toBe(403);
                }
              }
              await setForbidden('graph');
              await navigate(graphUrl);
              await expect(
                page.getByText(/403|Forbidden/).first(),
              ).toBeVisible();
              await expect(page.locator('.react-flow__node')).toHaveCount(0);
            } finally {
              await setForbidden(false);
            }
          }
        }
        expect(errors).toEqual([]);
      } catch (error) {
        const failure = {
          system,
          basePath,
          url: page.url(),
          errors,
          text: await page.locator('body').innerText(),
          requests,
        };
        console.error(JSON.stringify(failure, null, 2));
        const directory = process.env.QUALIFICATION_EVIDENCE_DIRECTORY;
        if (directory) {
          fs.mkdirSync(directory, { recursive: true });
          fs.writeFileSync(
            path.join(directory, `${system}-failure.json`),
            `${JSON.stringify(failure, null, 2)}\n`,
          );
          await page.screenshot({
            path: path.join(directory, `${system}-failure.png`),
            fullPage: true,
          });
        }
        throw error;
      } finally {
        await context.close();
      }
      console.log(
        `FS-03/08 PASS: packed ${system}, eight pages, nested paths, real graph, refresh and history`,
      );
    }
    if (installed) {
      for (const entry of ['legacy', 'native']) {
        expect(
          requests.some(
            request =>
              request.system === entry &&
              request.method === 'POST' &&
              request.path.includes('/getGraph?') &&
              request.cluster === 'packed-cluster' &&
              request.status === 200,
          ),
        ).toBe(true);
        expect(
          requests.some(
            request => request.system === entry && request.status === 403,
          ),
        ).toBe(true);
      }
      const unauthenticated = await fetch(`${origin}/api/kubernetes/clusters`);
      expect(unauthenticated.status).toBe(401);
      fs.writeFileSync(
        path.join(output, 'http-evidence.json'),
        `${JSON.stringify(
          {
            transport: backendUrl
              ? 'real built backend Kubernetes proxy to declared fake upstream'
              : 'declared HTTP Kubernetes API fixture, not a qualified Backstage backend',
            auth: 'host-owned fixture identity; no automatic guest sign-in',
            requests,
            css: Object.fromEntries(
              ['legacy', 'native'].map(entry => [
                entry,
                sha256(path.join(output, `${entry}.css`)),
              ]),
            ),
          },
          null,
          2,
        )}\n`,
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
