import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertCandidateResolution,
  assertInside,
  assertInstalledReact18,
  assertProductionInputs,
  installedPackage,
  isInsidePath,
} from './installed-host.ts';

test('clean installed host seeds the tested dependency tuple and can update its lockfile in CI', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const evidence = fs.mkdtempSync(
    path.join(os.tmpdir(), 'installed-host-seed-'),
  );
  try {
    const childProcessSource = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import path from 'node:path';
      export function execFileSync(command, args, options) {
        if (command !== 'qualification-yarn')
          return globalThis.qualificationExecFileSync(command, args, options);
        const output = args.indexOf('--out');
        if (output !== -1) {
          const packed = fs.mkdtempSync(path.join(${JSON.stringify(evidence)}, 'packed-'));
          try {
            fs.mkdirSync(path.join(packed, 'package'));
            const workspace = args[1] === '@internal/plugin-radius'
              ? 'plugins/plugin-radius'
              : 'packages/rad-components';
            fs.copyFileSync(
              path.join(options.cwd, workspace, 'package.json'),
              path.join(packed, 'package', 'package.json'),
            );
            globalThis.qualificationExecFileSync('tar', ['-czf', args[output + 1], '-C', packed, 'package']);
          } finally {
            fs.rmSync(packed, { recursive: true, force: true });
          }
        }
        if (args[0] !== 'install') return;
        assert.deepEqual(args, ['install', '--no-immutable']);
        assert.equal(options.env.CI, 'true');
        assert.equal(fs.existsSync(path.join(options.cwd, 'node_modules')), false);
        const manifest = JSON.parse(fs.readFileSync(path.join(options.cwd, 'package.json'), 'utf8'));
        assert.equal(
          manifest.resolutions['@radapp.io/rad-components'],
          manifest.dependencies['@radapp.io/rad-components'],
        );
        assert.equal(
          fs.readFileSync(path.join(options.cwd, 'yarn.lock'), 'utf8'),
          fs.readFileSync(${JSON.stringify(path.join(root, 'yarn.lock'))}, 'utf8'),
        );
        console.log('Clean install retains the tested dependency tuple in CI');
        throw new Error('Injected stop before package installation');
      }
    `;
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import { registerHooks } from 'node:module';
          import { execFileSync } from 'node:child_process';
          globalThis.qualificationExecFileSync = execFileSync;
          registerHooks({
            resolve(specifier, context, nextResolve) {
              return specifier === 'node:child_process'
                ? { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(childProcessSource)}), shortCircuit: true }
                : nextResolve(specifier, context);
            },
          });
          await import(${JSON.stringify(pathToFileURL(path.join(root, 'scripts', 'qualify-installed-host.ts')).href)});
        `,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          ...process.env,
          CI: 'true',
          COREPACK_ROOT: '',
          npm_execpath: 'qualification-yarn',
          QUALIFICATION_EVIDENCE_DIRECTORY: evidence,
          QUALIFICATION_WORK_DIRECTORY: '',
          QUALIFICATION_FULL_HOST_MATRIX: '',
          QUALIFICATION_CONTAINER_IMAGE: '',
        },
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      /Clean install retains the tested dependency tuple in CI/,
      result.stdout + result.stderr,
    );
    assert.match(result.stderr, /Injected stop before package installation/);
  } finally {
    fs.rmSync(evidence, { recursive: true, force: true });
  }
});

function fixture(
  run: (
    root: string,
    write: (file: string, content?: string) => string,
  ) => void,
) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'installed-host-contract-'),
  );
  const write = (file: string, content = '') => {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
    return absolute;
  };
  try {
    write('package.json', '{}');
    run(root, write);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('tuple lookup supports packages that do not export package.json', () => {
  fixture((root, write) => {
    write(
      'node_modules/renderer/package.json',
      JSON.stringify({
        name: 'renderer',
        version: '1.2.3',
        exports: { '.': './dist/index.js' },
      }),
    );
    write('node_modules/renderer/dist/index.js');
    assert.equal(installedPackage(root, 'renderer').manifest.version, '1.2.3');
  });
});

test('RX-01/03: accept one host React 18 pair, reject React 19 and duplicate React 18', () => {
  fixture((root, write) => {
    for (const name of ['react', 'react-dom']) {
      write(
        `node_modules/${name}/package.json`,
        JSON.stringify({ name, version: '18.3.1' }),
      );
    }
    write(
      'node_modules/@emotion/react/package.json',
      '{"name":"@emotion/react","version":"11.0.0"}',
    );
    write(
      'node_modules/@types/react/package.json',
      '{"name":"@types/react","version":"18.0.0"}',
    );
    assert.doesNotThrow(() => assertInstalledReact18(root));
    write(
      'node_modules/react/package.json',
      '{"name":"react","version":"19.0.0"}',
    );
    assert.throws(() => assertInstalledReact18(root), /requires React 18/);
    write(
      'node_modules/react/package.json',
      '{"name":"react","version":"18.3.1"}',
    );
    write(
      'node_modules/host/node_modules/react/package.json',
      '{"name":"react","version":"18.3.1"}',
    );
    assert.throws(
      () => assertInstalledReact18(root),
      /one installed react copy/,
    );
  });
});

test('IA-04/06/08: require compiled candidates and CSS, reject source and old renderer inputs', () => {
  fixture((root, write) => {
    const inputs = [
      'node_modules/@internal/plugin-radius/dist/index.esm.js',
      'node_modules/@internal/plugin-radius/dist/alpha.esm.js',
      'node_modules/@radius-project/core/dist/graph.js',
      'node_modules/@radius-project/graph-react/dist/index.js',
      'node_modules/@radius-project/graph-react/dist/styles.css',
    ].map(file => write(file));
    assert.doesNotThrow(() => assertProductionInputs(root, inputs));
    assert.doesNotThrow(() =>
      assertProductionInputs(root, ['<define:process.env>', ...inputs]),
    );
    assert.throws(
      () => assertProductionInputs(root, inputs.slice(0, -1)),
      /missing candidate input/,
    );
    assert.throws(
      () => assertProductionInputs(root, inputs.slice(0, 2)),
      /missing candidate input/,
    );
    for (const forbidden of [
      'node_modules/@internal/plugin-radius/src/index.ts',
      'node_modules/@radapp.io/rad-components/src/graphModel.ts',
      'node_modules/reactflow/dist/index.js',
      'node_modules/@reactflow/core/dist/index.js',
    ]) {
      assert.throws(
        () => assertProductionInputs(root, [...inputs, write(forbidden)]),
        /must not/,
      );
    }
    const external = fs.mkdtempSync(
      path.join(os.tmpdir(), 'external-host-input-'),
    );
    try {
      const file = path.join(external, 'source.ts');
      fs.writeFileSync(file, '');
      assert.throws(
        () => assertProductionInputs(root, [...inputs, file]),
        /escapes/,
      );
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
});

test('IA-03: plugin must resolve the forwarding archive and shared candidates directly', () => {
  for (const duplicate of [
    undefined,
    '@radius-project/graph-react',
    '@radapp.io/rad-components',
  ]) {
    fixture((root, write) => {
      for (const name of [
        '@internal/plugin-radius',
        '@radapp.io/rad-components',
      ]) {
        write(
          `node_modules/${name}/package.json`,
          JSON.stringify({ name, main: 'dist/index.js' }),
        );
        write(`node_modules/${name}/dist/index.js`);
      }
      write(
        'node_modules/@radius-project/core/package.json',
        JSON.stringify({
          name: '@radius-project/core',
          exports: {
            './graph': './dist/graph.js',
            './domain': './dist/domain.js',
          },
        }),
      );
      write('node_modules/@radius-project/core/dist/graph.js');
      write('node_modules/@radius-project/core/dist/domain.js');
      write(
        'node_modules/@radius-project/graph-react/package.json',
        JSON.stringify({
          name: '@radius-project/graph-react',
          main: 'dist/index.js',
        }),
      );
      write('node_modules/@radius-project/graph-react/dist/index.js');
      if (duplicate) {
        write(
          `node_modules/@internal/plugin-radius/node_modules/${duplicate}/package.json`,
          '{"main":"index.js"}',
        );
        write(
          `node_modules/@internal/plugin-radius/node_modules/${duplicate}/index.js`,
        );
        assert.throws(
          () => assertCandidateResolution(root),
          /resolution differ/,
        );
      } else {
        assert.doesNotThrow(() => assertCandidateResolution(root));
      }
    });
  }
});

test('path guards: parent is outside, "..foo" child is inside, root is inside', () => {
  fixture((root, write) => {
    write('..foo/file.js');
    write('inner/file.js');
    assert.equal(isInsidePath(root, root), true);
    assert.equal(isInsidePath(root, path.join(root, 'inner')), true);
    assert.equal(isInsidePath(root, path.join(root, '..foo')), true);
    assert.doesNotThrow(() =>
      assertInside(root, path.join(root, '..foo', 'file.js')),
    );
    assert.equal(isInsidePath(root, path.dirname(root)), false);
    const missing = path.join(root, 'not-yet', 'deep');
    assert.equal(isInsidePath(root, missing), true);
    assert.equal(isInsidePath(path.join(root, 'inner'), missing), false);
    assert.equal(fs.existsSync(path.join(root, 'not-yet')), false);
    assert.equal(isInsidePath(path.join(root, 'inner'), root), false);
    assert.throws(
      () => assertInside(path.join(root, 'inner'), root),
      /escapes/,
    );
  });
});
