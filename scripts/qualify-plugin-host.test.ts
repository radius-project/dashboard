import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
        export async function build() {
          return { metafile: { inputs: {
            'plugin-radius/dist/alpha.esm.js': {},
            'plugin-radius/dist/index.esm.js': {},
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
            const replacements = ${JSON.stringify({
              esbuild: buildSource,
              '@playwright/test': browserSource,
            })};
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
      if (scenario !== 'launch') {
        assert.match(result.stdout, /Browser close attempted/);
      }
      if (scenario === 'journey-and-close') {
        assert.match(result.stderr, /Injected close failure/);
      }
    } finally {
      rmSync(consumer, { recursive: true, force: true });
    }
  });
}
