import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = pathToFileURL(
  join(root, 'scripts', 'qualify-plugin-host.ts'),
).href;

for (const scenario of ['launch', 'journey', 'journey-and-close']) {
  test(`packed host exits and closes its server after ${scenario} failure`, () => {
    const consumer = mkdtempSync(join(tmpdir(), 'radius-host-cleanup-test-'));
    try {
      const browserSource = `
        export const chromium = {
          async launch() {
            if (${JSON.stringify(scenario)} === 'launch') throw new Error('Injected launch failure');
            return {
              async newContext() { throw new Error('Injected journey failure'); },
              async close() {
                console.log('Browser close attempted');
                if (${JSON.stringify(scenario)} === 'journey-and-close') throw new Error('Injected close failure');
              },
            };
          },
        };
        export const expect = () => {};
      `;
      const buildSource = `
        export async function build(options) {
          return { metafile: { inputs: {
            'plugin-radius/dist/alpha.esm.js': {},
            'plugin-radius/dist/index.esm.js': {},
          }, outputs: {
            [options.outdir + '/native.js']: { inputs: {}, imports: [] },
            [options.outdir + '/legacy.js']: { inputs: {}, imports: [] },
          } } };
        }

      `;
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
          import { registerHooks } from 'node:module';
          const replacements = ${JSON.stringify({ esbuild: buildSource, '@playwright/test': browserSource })};
          registerHooks({
            resolve(specifier, context, nextResolve) {
              const source = replacements[specifier];
              return source
                ? { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true }
                : nextResolve(specifier, context);
            },
          });
          process.argv[2] = ${JSON.stringify(consumer)};
          await import(${JSON.stringify(runner)});
        `,
        ],
        { cwd: root, encoding: 'utf8', timeout: 10_000 },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(
        result.stderr,
        scenario === 'launch'
          ? /Injected launch failure/
          : /Injected journey failure/,
      );
      if (scenario !== 'launch')
        assert.match(result.stdout, /Browser close attempted/);
      if (scenario === 'journey-and-close')
        assert.match(result.stderr, /Injected close failure/);
    } finally {
      rmSync(consumer, { recursive: true, force: true });
    }
  });
}

for (const scenario of [
  'isolated',
  'outside',
  'source',
  'missing-css',
  'empty-css',
  'old-renderer',
  'full-matrix',
  'standalone',
  'standalone-missing-evidence',
  'standalone-relative-evidence',
  'standalone-without-installed',
  'backend',
  'backend-without-upstream',
]) {
  test(`installed qualification preserves the ${scenario} boundary`, () => {
    const consumer = mkdtempSync(
      join(tmpdir(), 'radius-installed-runner-test-'),
    );
    const evidence = join(consumer, 'evidence');
    const bundleInputs = [
      'node_modules/@internal/plugin-radius/dist/index.esm.js',
      'node_modules/@internal/plugin-radius/dist/alpha.esm.js',
      'node_modules/@internal/plugin-radius/dist/api/query.esm.js',
      'node_modules/@internal/plugin-radius/dist/components/resources/legacyGraph.esm.js',
      'node_modules/@radius-project/core/dist/graph/index.js',
      'node_modules/@radius-project/graph-react/dist/index.js',
      ...(scenario === 'missing-css'
        ? []
        : ['node_modules/@radius-project/graph-react/dist/styles.css']),
      ...(scenario === 'source'
        ? ['node_modules/@radapp.io/rad-components/src/index.ts']
        : []),
      ...(scenario === 'old-renderer'
        ? ['node_modules/reactflow/dist/esm/index.mjs']
        : []),
    ];
    const inputs = Object.fromEntries(
      bundleInputs.map(input => [join(consumer, input), { bytes: 1 }]),
    );
    if (scenario === 'outside')
      inputs[join(root, 'node_modules', 'react', 'index.js')] = { bytes: 1 };
    try {
      const buildSource = `
                import assert from 'node:assert/strict';
                import fs from 'node:fs';
                import path from 'node:path';
                export async function build(options) {
                  assert.notEqual(${JSON.stringify(scenario)}, 'standalone', 'Standalone must not replace its built frontend');
                  assert.equal(options.absWorkingDir, ${JSON.stringify(consumer)});
                  if (options.platform === 'node') {
                    assert.deepEqual(options.entryPoints, ['packages/backend/src/createRadiusBackend.ts']);
                    fs.writeFileSync(options.outfile, 'export const createRadiusBackend = () => {};');
                    return { metafile: { inputs: { 'packages/backend/src/createRadiusBackend.ts': {} } } };
                  }
                  assert.deepEqual(options.nodePaths, [], 'Installed builds must not fall back to checkout dependencies');
                  assert.deepEqual(options.entryPoints, {
                    native: path.join(${JSON.stringify(consumer)}, 'packages', 'app', 'fixture', 'native.tsx'),
                    legacy: path.join(${JSON.stringify(consumer)}, 'packages', 'app', 'fixture', 'legacy.tsx'),
                  });
                  fs.mkdirSync(options.outdir, { recursive: true });
                  for (const name of ['native', 'legacy']) fs.writeFileSync(path.join(options.outdir, name + '.css'), ${JSON.stringify(scenario === 'empty-css' ? '' : '.react-flow {}')});
                  return { metafile: {
                    inputs: ${JSON.stringify(inputs)},
                    outputs: Object.fromEntries(['native','legacy'].map(name => [path.join(options.outdir, name + '.js'), { inputs: {}, imports: [] }])),
                  } };
                }
              `;
      const browserSource = `
                import assert from 'node:assert/strict';
                export const chromium = {
                  async launch() {
                    console.log('Browser launched');
                    return {
                      async close() { globalThis.testBackend?.closeAllConnections(); globalThis.testBackend?.close(); },
                      async newContext() {
                        return {
                          async close() {},
                          async newPage() {
                            return {
                              on() {},
                              async setViewportSize() {},
                              async route() { throw new Error('Installed HTTP must not be intercepted'); },
                              url() { return 'qualification://stopped'; },
                              locator() { return { async innerText() { return ''; } }; },
                              async screenshot() {},
                              async goto(url) {
                                if (${JSON.stringify(scenario)} === 'standalone') {
                                  assert.equal(url, 'http://127.0.0.1:9/nested/plugins/radius/applications');
                                } else {
                                  assert.match(url, /\\/plugins\\/radius\\/applications$/);
                                  const origin = new URL(url).origin;
                                  const html = await (await fetch(url)).text();
                                  assert.match(html, /meta name="installed-host"/);
                                  assert.match(html, /meta name="plugin-mount-path" content="\\/plugins\\/radius"/);
                                  if (${JSON.stringify(scenario)} === 'backend') {
                                    const reply = await fetch(origin + '/api/kubernetes/proxy/graph', {
                                      method: 'POST',
                                      headers: { authorization: 'Bearer fixture', 'backstage-kubernetes-cluster': 'second', 'content-type': 'application/json' },
                                      body: '{"graph":true}',
                                    });
                                    assert.equal(reply.status, 403);
                                    assert.deepEqual(await reply.json(), { denied: true });
                                  } else {
                                    assert.equal((await fetch(origin + '/api/kubernetes/clusters')).status, 401);
                                    assert.equal((await fetch(origin + '/api/kubernetes/clusters', { headers: { authorization: 'Bearer radius-installed-host-fixture' } })).status, 200);
                                  }
                                }
                                console.log('Host boundary verified');
                                throw new Error('Injected stop after boundary');
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
                export function expect() { throw new Error('Unexpected assertion before first navigation'); }
              `;
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
                  import assert from 'node:assert/strict';
                  import {createServer} from 'node:http';
                  import {once} from 'node:events';
                  import {registerHooks} from 'node:module';
                  const replacements = ${JSON.stringify({ esbuild: buildSource, '@playwright/test': browserSource })};
                  registerHooks({ resolve(specifier, context, next) {
                    return replacements[specifier]
                      ? {url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier]), shortCircuit: true}
                      : next(specifier, context);
                  }});
                  for (const key of Object.keys(process.env)) if (key.startsWith('QUALIFICATION_')) delete process.env[key];
                  process.env.QUALIFICATION_EVIDENCE_DIRECTORY = ${JSON.stringify(evidence)};
                  if (${JSON.stringify(scenario)} === 'full-matrix') process.env.QUALIFICATION_FULL_HOST_MATRIX = 'true';
                  if (${JSON.stringify(scenario)}.startsWith('standalone')) {
                    process.env.QUALIFICATION_STANDALONE_ORIGIN = 'http://127.0.0.1:9';
                    process.env.QUALIFICATION_APP_BASE_PATH = '/nested';
                    process.env.QUALIFICATION_PLUGIN_MOUNT_PATH = '/plugins/radius';
                  }
                  if (${JSON.stringify(scenario)} === 'standalone-missing-evidence') delete process.env.QUALIFICATION_EVIDENCE_DIRECTORY;
                  if (${JSON.stringify(scenario)} === 'standalone-relative-evidence') process.env.QUALIFICATION_EVIDENCE_DIRECTORY = 'relative-evidence';
                  if (${JSON.stringify(scenario)} === 'backend-without-upstream') process.env.QUALIFICATION_BACKEND_URL = 'http://127.0.0.1:9';
                  if (${JSON.stringify(scenario)} === 'backend') {
                    const backend = createServer(async (request, response) => {
                      let body = '';
                      for await (const chunk of request) body += chunk;
                      assert.equal(request.method, 'POST');
                      assert.equal(request.url, '/api/kubernetes/proxy/graph');
                      assert.equal(request.headers.authorization, 'Bearer fixture');
                      assert.equal(request.headers['backstage-kubernetes-cluster'], 'second');
                      assert.equal(body, '{"graph":true}');
                      response.writeHead(403, {'content-type': 'application/json'}).end('{"denied":true}');
                    });
                    backend.listen(0, '127.0.0.1');
                    await once(backend, 'listening');
                    backend.unref();
                    globalThis.testBackend = backend;
                    process.env.QUALIFICATION_BACKEND_URL = 'http://127.0.0.1:' + backend.address().port;
                    process.env.QUALIFICATION_UPSTREAM_URL = process.env.QUALIFICATION_BACKEND_URL;
                  }
                  process.argv = [process.execPath, ${JSON.stringify(runner)}, ${JSON.stringify(consumer)}, ...(${JSON.stringify(scenario)} === 'standalone-without-installed' ? [] : ['--installed'])];
                  await import(${JSON.stringify(runner)});
                `,
        ],
        { cwd: root, encoding: 'utf8', timeout: 10_000 },
      );
      assert.ifError(result.error);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const expectedFailures: Record<string, RegExp> = {
        outside: /Installed host input escapes its isolated root/,
        source: /Production host must not build Radius workspace source/,
        'missing-css': /Production host is missing candidate input/,
        'empty-css': /Missing shipped graph CSS/,
        'old-renderer':
          /Production Radius host must not use the old graph renderer/,
        'standalone-missing-evidence':
          /Standalone journeys require installed mode and persistent absolute evidence/,
        'standalone-relative-evidence':
          /Standalone journeys require installed mode and persistent absolute evidence/,
        'standalone-without-installed':
          /Standalone journeys require installed mode and persistent absolute evidence/,
        'backend-without-upstream':
          /Real backend journeys require installed mode and a controlled fake upstream/,
      };
      const expectedFailure = expectedFailures[scenario];
      if (expectedFailure) {
        assert.match(result.stderr, expectedFailure);
        assert.doesNotMatch(result.stdout, /Browser launched/);
      } else {
        assert.match(result.stdout, /Host boundary verified/, result.stderr);
        assert.match(result.stderr, /Injected stop after boundary/);
        if (scenario !== 'standalone') {
          const output =
            scenario === 'backend'
              ? join(evidence, 'browser')
              : join(consumer, 'browser');
          assert.ok(existsSync(join(output, 'metafile.json')));
        }
        if (scenario === 'full-matrix') {
          assert.ok(
            existsSync(join(consumer, 'browser', 'backend-composition.cjs')),
          );
          assert.deepEqual(
            Object.keys(
              JSON.parse(
                readFileSync(
                  join(consumer, 'browser', 'backend-metafile.json'),
                  'utf8',
                ),
              ).inputs,
            ),
            ['packages/backend/src/createRadiusBackend.ts'],
          );
        }
      }
    } finally {
      rmSync(consumer, { recursive: true, force: true });
    }
  });
}
