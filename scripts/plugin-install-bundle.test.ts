import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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

function packFixture(
  root: string,
  file: string,
  name: string,
  version: string,
  dependencies = name === '@internal/plugin-radius'
    ? {
        '@radius-project/core': '0.1.0',
        '@radius-project/graph-react': '0.1.0',
      }
    : {},
) {
  const contents = path.join(root, 'package');
  fs.mkdirSync(contents);
  fs.writeFileSync(
    path.join(contents, 'package.json'),
    JSON.stringify({ name, version, dependencies }),
  );
  try {
    execFileSync('tar', ['-czf', path.join(root, file), '-C', root, 'package']);
  } finally {
    fs.rmSync(contents, { recursive: true, force: true });
  }
}

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
    packFixture(root, relative, name, '0.1.0');
    bundle.files[relative] = bundleFileSha256(path.join(root, relative));
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
    path.join(root, 'verify.mts'),
  );
  bundle.files['verify.mts'] = bundleFileSha256(path.join(root, 'verify.mts'));
  const save = () =>
    fs.writeFileSync(path.join(root, 'bundle.json'), JSON.stringify(bundle));
  save();
  try {
    run(root, bundle, save);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('portable bundle verifies inside a CommonJS portal after a tar round trip without repository dependencies', () => {
  fixture((root, bundle) => {
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"commonjs"}');
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
      'verify.mts',
    ]);
    execFileSync('tar', ['-xzf', archive, '-C', unpacked]);
    assert.deepEqual(verifyPluginInstallBundle(unpacked), bundle);
    const output = execFileSync(
      process.execPath,
      [path.join(unpacked, 'verify.mts')],
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

test('reject an archive directory symlink', () => {
  fixture(root => {
    const archives = path.join(root, 'archives');
    const target = path.join(root, 'linked-archives');
    fs.renameSync(archives, target);
    fs.symlinkSync(target, archives, 'junction');
    assert.throws(
      () => verifyPluginInstallBundle(root),
      /Expected a real archives directory/,
    );
  });
});

test('reject a linked bundle root before the runner copies it', () => {
  fixture(root => {
    const link = `${root}-link`;
    fs.symlinkSync(root, link, 'junction');
    try {
      assert.throws(
        () => verifyPluginInstallBundle(link),
        /Expected a real plugin bundle directory/,
      );
    } finally {
      fs.unlinkSync(link);
    }
  });
});

test('reject a bundle manifest symlink', t => {
  fixture(root => {
    const manifest = path.join(root, 'bundle.json');
    const target = path.join(root, 'linked-manifest.json');
    fs.renameSync(manifest, target);
    try {
      fs.symlinkSync(target, manifest, 'file');
    } catch (error) {
      if (
        process.platform === 'win32' &&
        error instanceof Error &&
        'code' in error &&
        error.code === 'EPERM'
      ) {
        t.skip('File symlinks require Windows privileges');
        return;
      }
      throw error;
    }
    assert.throws(() => verifyPluginInstallBundle(root), /regular bundle.json/);
  });
});

test('reject unlisted files rather than retaining unchecked bundle contents', () => {
  fixture(root => {
    const extra = path.join(root, 'unlisted.txt');
    fs.writeFileSync(extra, 'unchecked');
    assert.throws(
      () => verifyPluginInstallBundle(root),
      /Unexpected bundle root/,
    );
    fs.unlinkSync(extra);
    fs.writeFileSync(path.join(root, 'archives', 'unlisted.txt'), 'unchecked');
    assert.throws(
      () => verifyPluginInstallBundle(root),
      /Unexpected bundle archive/,
    );
  });
});

test('recorded package identities must match the real packed manifests', () => {
  fixture((root, bundle, save) => {
    verifyPluginInstallBundle(root);
    for (const artifact of Object.values(bundle.packages)) {
      artifact.version = '9.9.9';
      save();
      assert.throws(
        () => verifyPluginInstallBundle(root),
        /archive version mismatch/,
      );
      artifact.version = '0.1.0';
    }
    const plugin = bundle.packages['@internal/plugin-radius'];
    packFixture(root, plugin.path, '@internal/wrong-plugin', plugin.version);
    plugin.sha256 = bundleFileSha256(path.join(root, plugin.path));
    bundle.files[plugin.path] = plugin.sha256;
    save();
    assert.throws(
      () => verifyPluginInstallBundle(root),
      /archive name mismatch/,
    );
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

test('a concurrent pack cannot read or restore another packs rewritten manifest', () => {
  fixture(root => {
    const workspace = path.join(root, 'plugin');
    fs.mkdirSync(workspace);
    const manifest = path.join(workspace, 'package.json');
    const original = '{"name":"@internal/plugin-radius","private":true}\n';
    fs.writeFileSync(manifest, original);
    assert.throws(
      () =>
        packWorkspace(root, 'plugin', path.join(root, 'a.tgz'), args => {
          if (!args.includes('pack')) return;
          fs.writeFileSync(manifest, '{"name":"rewritten-by-prepack"}');
          const child = spawnSync(
            process.execPath,
            [
              '--input-type=module',
              '-e',
              `
        import { packWorkspace } from ${JSON.stringify(new URL('./plugin-install-bundle.ts', import.meta.url).href)};
        packWorkspace(${JSON.stringify(root)}, 'plugin', ${JSON.stringify(path.join(root, 'b.tgz'))}, () => {});
      `,
            ],
            { encoding: 'utf8' },
          );
          assert.notEqual(child.status, 0);
          assert.match(child.stderr, /EEXIST/);
          assert.equal(
            fs.readFileSync(manifest, 'utf8'),
            '{"name":"rewritten-by-prepack"}',
          );
          throw new Error('prepack failed');
        }),
      /prepack failed/,
    );
    assert.equal(fs.readFileSync(manifest, 'utf8'), original);
    assert.equal(
      fs.existsSync(path.join(root, '.radius-plugin-pack.lock')),
      false,
    );
  });
});

test('supplied plugin pins must match bundled versions even when archive hashes match', () => {
  fixture((root, bundle, save) => {
    const plugin = bundle.packages['@internal/plugin-radius'];
    for (const name of [
      '@radius-project/core',
      '@radius-project/graph-react',
    ]) {
      packFixture(
        root,
        plugin.path,
        '@internal/plugin-radius',
        plugin.version,
        {
          '@radius-project/core': '0.1.0',
          '@radius-project/graph-react': '0.1.0',
          [name]: '9.9.9',
        },
      );
      plugin.sha256 = bundleFileSha256(path.join(root, plugin.path));
      bundle.files[plugin.path] = plugin.sha256;
      save();
      assert.throws(
        () => verifyPluginInstallBundle(root),
        /plugin dependency mismatch/,
      );
    }
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

test('destinations that appear during a build keep their bytes and only this run is rolled back', () => {
  const repository = path.resolve(import.meta.dirname, '..');
  const plugin = JSON.parse(
    fs.readFileSync(
      path.join(repository, 'plugins', 'plugin-radius', 'package.json'),
      'utf8',
    ),
  );
  for (const collision of [
    'archive',
    'directory',
    'empty-directory',
    'checksum',
  ]) {
    fixture(root => {
      packFixture(
        root,
        'archives/plugin.tgz',
        plugin.name,
        plugin.version,
        plugin.dependencies,
      );
      const output = path.join(root, 'output');
      const archive = `${output}.tar.gz`;
      const marker =
        collision === 'archive'
          ? archive
          : collision === 'checksum'
            ? `${archive}.sha256`
            : path.join(output, 'keep.txt');
      assert.throws(
        () =>
          buildPluginInstallBundle(repository, output, args => {
            if (args[0] === 'tsc') {
              if (collision === 'directory' || collision === 'empty-directory')
                fs.mkdirSync(output);
              if (collision !== 'empty-directory')
                fs.writeFileSync(marker, 'other build output');
            }
            if (args.includes('pack'))
              fs.copyFileSync(
                path.join(root, 'archives', 'plugin.tgz'),
                args[args.length - 1],
              );
          }),
        /EEXIST|ENOTEMPTY|EPERM|EACCES/,
      );
      if (collision === 'empty-directory')
        assert.deepEqual(fs.readdirSync(output), []);
      else assert.equal(fs.readFileSync(marker, 'utf8'), 'other build output');
      assert.equal(fs.existsSync(archive), collision === 'archive');
      assert.equal(
        fs.existsSync(output),
        collision === 'directory' || collision === 'empty-directory',
      );
      assert.equal(
        fs.existsSync(`${archive}.sha256`),
        collision === 'checksum',
      );
    });
  }
});
