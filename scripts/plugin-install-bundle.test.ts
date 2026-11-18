import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildPluginInstallBundle,
  packWorkspace,
} from './plugin-install-bundle.ts';
import {
  bundleFileSha256,
  pluginInstallSettings,
  verifyPluginInstallBundle,
  type PluginInstallBundle,
} from './verify-plugin-bundle.ts';

function fixture(
  run: (root: string, bundle: PluginInstallBundle, save: () => void) => void,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radius bundle '));
  fs.mkdirSync(path.join(root, 'archives'));
  const bundle: PluginInstallBundle = {
    formatVersion: 1,
    source: { revision: 'a'.repeat(40), dirty: false },
    toolchain: { node: 'v24.22.0', packageManager: 'yarn@4.18.1' },
    packages: {},
    files: {},
  };
  const write = (file: string, content: string) => {
    fs.writeFileSync(path.join(root, file), content);
    bundle.files[file] = bundleFileSha256(path.join(root, file));
  };
  for (const [name, file] of [
    ['@internal/plugin-radius', 'plugin.tgz'],
    ['@radius-project/core', 'core.tgz'],
    ['@radius-project/graph-react', 'graph.tgz'],
  ]) {
    const relative = `archives/${file}`;
    write(relative, name);
    bundle.packages[name] = {
      path: relative,
      version: '0.1.0',
      sha256: bundle.files[relative],
    };
  }
  write(
    'archives/candidate.json',
    JSON.stringify({
      core: {
        path: 'core.tgz',
        sha256: bundle.packages['@radius-project/core'].sha256,
      },
      graphReact: {
        path: 'graph.tgz',
        sha256: bundle.packages['@radius-project/graph-react'].sha256,
      },
    }),
  );
  write('install-settings.json', JSON.stringify(pluginInstallSettings(bundle)));
  write('README.md', 'Development build');
  fs.copyFileSync(
    path.join(import.meta.dirname, 'verify-plugin-bundle.ts'),
    path.join(root, 'verify.ts'),
  );
  bundle.files['verify.ts'] = bundleFileSha256(path.join(root, 'verify.ts'));
  const save = () =>
    fs.writeFileSync(path.join(root, 'bundle.json'), JSON.stringify(bundle));
  save();
  try {
    run(root, bundle, save);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('portable bundle verifies after a tar round trip without repository dependencies', () => {
  fixture((root, bundle) => {
    const unpacked = path.join(root, 'moved bundle');
    fs.mkdirSync(unpacked);
    const archive = path.join(root, 'bundle.tar.gz');
    execFileSync('tar', [
      '-czf',
      archive,
      '-C',
      root,
      'archives',
      'bundle.json',
      'install-settings.json',
      'README.md',
      'verify.ts',
    ]);
    execFileSync('tar', ['-xzf', archive, '-C', unpacked]);
    assert.deepEqual(verifyPluginInstallBundle(unpacked), bundle);
    const output = execFileSync(
      process.execPath,
      [path.join(unpacked, 'verify.ts')],
      { cwd: os.tmpdir(), encoding: 'utf8' },
    );
    assert.match(output, /Verified plugin bundle/);
    const settings = pluginInstallSettings(bundle);
    assert.deepEqual(Object.keys(settings.root.resolutions).sort(), [
      '@radius-project/core',
      '@radius-project/graph-react',
    ]);
    for (const [name, dependency] of Object.entries(
      settings.root.resolutions,
    )) {
      const portal = path.dirname(root);
      assert.equal(
        path.resolve(portal, dependency.slice(5)),
        path.join(portal, 'radius-plugin-bundle', bundle.packages[name].path),
      );
    }
  });
});

test('changed or missing packages fail instead of verifying an incomplete bundle', () => {
  fixture(root => {
    const file = path.join(root, 'archives', 'plugin.tgz');
    fs.appendFileSync(file, 'changed');
    assert.throws(() => verifyPluginInstallBundle(root), /SHA-256 mismatch/);
    fs.unlinkSync(file);
    assert.throws(() => verifyPluginInstallBundle(root), /ENOENT/);
  });
});

test('install settings and candidate must select the recorded packages even when their file hashes match', () => {
  fixture((root, bundle, save) => {
    const settings = path.join(root, 'install-settings.json');
    const original = fs.readFileSync(settings);
    fs.writeFileSync(settings, '{}');
    bundle.files['install-settings.json'] = bundleFileSha256(settings);
    save();
    assert.throws(() => verifyPluginInstallBundle(root), /Install settings/);
    fs.writeFileSync(settings, original);
    bundle.files['install-settings.json'] = bundleFileSha256(settings);
    const receipt = path.join(root, 'archives', 'candidate.json');
    const candidate = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    candidate.core.sha256 = 'f'.repeat(64);
    fs.writeFileSync(receipt, JSON.stringify(candidate));
    bundle.files['archives/candidate.json'] = bundleFileSha256(receipt);
    save();
    assert.throws(
      () => verifyPluginInstallBundle(root),
      /Expected values to be strictly equal/,
    );
  });
});

test('reject unsafe archive paths and an absent dependency', () => {
  fixture((root, bundle, save) => {
    bundle.packages['@internal/plugin-radius'].path = '../outside.tgz';
    bundle.files['../outside.tgz'] = bundle.files['archives/plugin.tgz'];
    delete bundle.files['archives/plugin.tgz'];
    save();
    assert.throws(() => verifyPluginInstallBundle(root), /Invalid bundle path/);
    delete bundle.packages['@radius-project/core'];
    save();
    assert.throws(() => verifyPluginInstallBundle(root), /two shared packages/);
  });
});

test('workspace packing restores the original manifest if prepack fails', () => {
  fixture(root => {
    const workspace = path.join(root, 'plugin');
    fs.mkdirSync(workspace);
    const manifest = path.join(workspace, 'package.json');
    const original = '{"name":"@internal/plugin-radius","private":true}\n';
    fs.writeFileSync(manifest, original);
    assert.throws(
      () =>
        packWorkspace(root, 'plugin', path.join(root, 'plugin.tgz'), args => {
          if (args.includes('pack')) {
            fs.writeFileSync(manifest, '{"name":"modified"}');
            throw new Error('prepack failed');
          }
        }),
      /prepack failed/,
    );
    assert.equal(fs.readFileSync(manifest, 'utf8'), original);
  });
});

test('bundle builder rejects in-repository output and existing destinations before building', () => {
  fixture(root => {
    let called = false;
    const run = () => {
      called = true;
    };
    assert.throws(
      () => buildPluginInstallBundle(root, path.join(root, 'output'), run),
      /outside the checkout/,
    );
    assert.throws(
      () => buildPluginInstallBundle(path.join(root, 'checkout'), root, run),
      /Refusing to overwrite/,
    );
    assert.equal(called, false);
  });
});
