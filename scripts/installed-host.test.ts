import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  assertCandidateResolution,
  assertInside,
  assertInstalledReact18,
  assertProductionInputs,
  installedPackage,
  isInsidePath,
} from './installed-host.ts';

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

test('IA-03: plugin and forwarding consumers must resolve the direct shared candidates', () => {
  for (const duplicate of [false, true]) {
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
          'node_modules/@internal/plugin-radius/node_modules/@radius-project/graph-react/package.json',
          '{"main":"index.js"}',
        );
        write(
          'node_modules/@internal/plugin-radius/node_modules/@radius-project/graph-react/index.js',
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
    assert.equal(isInsidePath(path.join(root, 'inner'), root), false);
    assert.throws(
      () => assertInside(path.join(root, 'inner'), root),
      /escapes/,
    );
  });
});
