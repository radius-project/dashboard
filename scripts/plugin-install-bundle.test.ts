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

function fixtureGit(
  directory: string,
  args: string[],
  inherited = process.env,
) {
  const env: NodeJS.ProcessEnv = {
    ...inherited,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(directory, 'gitconfig'),
    GIT_CONFIG_COUNT: '0',
  };
  for (const name of [
    'GIT_DIR',
    'GIT_COMMON_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
  ]) {
    delete env[name];
  }
  return execFileSync('git', ['-C', directory, ...args], {
    env,
    stdio: 'pipe',
  });
}

function packFixture(
  root: string,
  file: string,
  name: string,
  version: string,
  dependencies: Record<string, string> = name === '@internal/plugin-radius'
    ? {
        '@radius-project/core': '0.1.0',
        '@radius-project/graph-react': '0.1.0',
        '@radapp.io/rad-components': '^0.1.0',
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

function builderCheckout(root: string) {
  const repository = path.resolve(import.meta.dirname, '..');
  const checkout = path.join(root, 'checkout');
  fixtureGit(root, [
    'clone',
    '--quiet',
    '--shared',
    '--no-checkout',
    repository,
    checkout,
  ]);
  for (const file of [
    'package.json',
    'plugins/plugin-radius/package.json',
    'packages/rad-components/package.json',
    'scripts/verify-plugin-bundle.ts',
  ]) {
    fs.mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true });
    fs.copyFileSync(path.join(repository, file), path.join(checkout, file));
  }
  fs.cpSync(
    path.join(repository, 'vendor', 'shared-libraries'),
    path.join(checkout, 'vendor', 'shared-libraries'),
    { recursive: true },
  );
  return checkout;
}

function fixturePacker(root: string, checkout: string, args: string[]) {
  if (!args.includes('pack')) return;
  const workspace =
    args[1] === '@internal/plugin-radius'
      ? 'plugins/plugin-radius'
      : 'packages/rad-components';
  const manifest = JSON.parse(
    fs.readFileSync(path.join(checkout, workspace, 'package.json'), 'utf8'),
  );
  packFixture(
    root,
    path.relative(root, args[args.length - 1]),
    manifest.name,
    manifest.version,
    manifest.dependencies,
  );
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
    ['@radapp.io/rad-components', 'forwarding.tgz'],
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
      '@radapp.io/rad-components',
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

test('CLI verification runs through a symlinked parent and preserves caller-side link checks', () => {
  fixture(root => {
    const parentLink = `${root}-parent`;
    const bundleLink = `${root}-link`;
    fs.symlinkSync(path.dirname(root), parentLink, 'junction');
    fs.symlinkSync(root, bundleLink, 'junction');
    try {
      const invoke = (file: string) =>
        spawnSync(process.execPath, [file], { encoding: 'utf8' });
      const linkedVerifier = path.join(
        parentLink,
        path.basename(root),
        'verify.mts',
      );
      const clean = invoke(linkedVerifier);
      assert.ifError(clean.error);
      assert.equal(clean.status, 0, clean.stderr);
      assert.match(clean.stdout, /Verified plugin bundle/);
      fs.appendFileSync(path.join(root, 'archives', 'plugin.tgz'), 'damaged');
      const damaged = invoke(linkedVerifier);
      assert.ifError(damaged.error);
      assert.notEqual(damaged.status, 0, damaged.stdout + damaged.stderr);
      assert.match(damaged.stderr, /SHA-256 mismatch/);
      const linkedRoot = invoke(path.join(bundleLink, 'verify.mts'));
      assert.ifError(linkedRoot.error);
      assert.notEqual(linkedRoot.status, 0);
      assert.match(
        linkedRoot.stderr,
        /Expected a real plugin bundle directory/,
      );
    } finally {
      fs.unlinkSync(parentLink);
      fs.unlinkSync(bundleLink);
    }
  });
});

test('verifier can be imported from Node stdin without running its CLI', () => {
  fixture(root => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
      input: `
        import { verifyPluginInstallBundle } from ${JSON.stringify(new URL('./verify-plugin-bundle.ts', import.meta.url).href)};
        verifyPluginInstallBundle(${JSON.stringify(root)});
        console.log('Imported verifier from stdin');
      `,
      encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), 'Imported verifier from stdin');
  });
});

test('builder CLI reports usage through a symlinked parent', () => {
  const repository = path.resolve(import.meta.dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-cli-'));
  const linked = path.join(root, 'checkout');
  fs.symlinkSync(repository, linked, 'junction');
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(linked, 'scripts', 'plugin-install-bundle.ts')],
      { encoding: 'utf8' },
    );
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage: yarn bundle:plugin/);
  } finally {
    fs.unlinkSync(linked);
    fs.rmdirSync(root);
  }
});

test('fixture Git commands cannot change an inherited repository config or index', () => {
  fixture(root => {
    const unrelated = path.join(root, 'unrelated');
    const portal = path.join(root, 'portal');
    fs.mkdirSync(unrelated);
    fs.mkdirSync(portal);
    fixtureGit(unrelated, ['init', '--quiet']);
    fs.writeFileSync(
      path.join(unrelated, 'keep.txt'),
      'original staged bytes\n',
    );
    fixtureGit(unrelated, ['add', '.']);
    const config = path.join(unrelated, '.git', 'config');
    const index = path.join(unrelated, '.git', 'index');
    const beforeConfig = fs.readFileSync(config);
    const beforeIndex = fs.readFileSync(index);
    const inherited = {
      ...process.env,
      GIT_DIR: path.dirname(config),
      GIT_INDEX_FILE: index,
      GIT_CONFIG: config,
    };
    fixtureGit(portal, ['init', '--quiet'], inherited);
    fixtureGit(portal, ['config', 'core.autocrlf', 'true'], inherited);
    fs.writeFileSync(
      path.join(portal, 'fixture.txt'),
      'isolated staged bytes\n',
    );
    fixtureGit(portal, ['add', '.'], inherited);
    assert.deepEqual(fs.readFileSync(config), beforeConfig);
    assert.deepEqual(fs.readFileSync(index), beforeIndex);
    assert(fs.existsSync(path.join(portal, '.git', 'index')));
    assert.match(
      fs.readFileSync(path.join(portal, '.git', 'config'), 'utf8'),
      /autocrlf = true/,
    );
  });
});

test('portal attributes preserve bundle hashes through a Git checkout with autocrlf enabled', () => {
  fixture(root => {
    for (const preserve of [false, true]) {
      const portal = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-portal-'));
      try {
        fs.cpSync(root, path.join(portal, 'radius-plugin-bundle'), {
          recursive: true,
        });
        const git = (args: string[]) => fixtureGit(portal, args);
        git(['init', '--quiet']);
        git(['config', 'core.autocrlf', 'true']);
        git(['config', 'core.safecrlf', 'false']);
        if (preserve)
          fs.writeFileSync(
            path.join(portal, '.gitattributes'),
            'radius-plugin-bundle/** -text\n',
          );
        git(['add', '.']);
        const restored = path.join(portal, 'restored');
        fs.mkdirSync(restored);
        git(['checkout-index', '--all', `--prefix=${restored}${path.sep}`]);
        const bundle = path.join(restored, 'radius-plugin-bundle');
        if (preserve) verifyPluginInstallBundle(bundle);
        else
          assert.throws(
            () => verifyPluginInstallBundle(bundle),
            /SHA-256 mismatch/,
          );
      } finally {
        fs.rmSync(portal, { recursive: true, force: true });
      }
    }
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

test('failed manifest restoration retains the owner lock and blocks the next pack', () => {
  fixture(root => {
    const workspace = path.join(root, 'plugin');
    fs.mkdirSync(workspace);
    const manifest = path.join(workspace, 'package.json');
    fs.writeFileSync(
      manifest,
      '{"name":"@internal/plugin-radius","private":true}\n',
    );
    const lock = path.join(root, '.radius-plugin-pack.lock');
    assert.throws(
      () =>
        packWorkspace(root, 'plugin', path.join(root, 'plugin.tgz'), args => {
          if (!args.includes('pack')) return;
          fs.writeFileSync(manifest, '{"name":"rewritten-by-prepack"}');
          fs.renameSync(manifest, path.join(workspace, 'rewritten.json'));
          fs.mkdirSync(manifest);
          throw new Error('prepack failed');
        }),
      error => {
        assert(error instanceof Error);
        assert.match(error.message, /Could not restore/);
        assert(error.message.includes(lock));
        return true;
      },
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(lock, 'utf8')), {
      pid: process.pid,
      hostname: os.hostname(),
      workspace: 'plugin',
    });
    assert.throws(
      () =>
        packWorkspace(root, 'plugin', path.join(root, 'retry.tgz'), () =>
          assert.fail('Packing must not start'),
        ),
      /EEXIST/,
    );
    assert.equal(
      fs.readFileSync(path.join(workspace, 'rewritten.json'), 'utf8'),
      '{"name":"rewritten-by-prepack"}',
    );
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
          assert.deepEqual(
            JSON.parse(
              fs.readFileSync(
                path.join(root, '.radius-plugin-pack.lock'),
                'utf8',
              ),
            ),
            { pid: process.pid, hostname: os.hostname(), workspace: 'plugin' },
          );
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
          const otherWriter = spawnSync(
            process.execPath,
            [
              '--input-type=module',
              '-e',
              `
        import { withWorkspaceManifest } from ${JSON.stringify(new URL('../plugins/plugin-radius/workspace-manifest.ts', import.meta.url).href)};
        withWorkspaceManifest(${JSON.stringify(root)}, 'missing-workspace', () => { throw new Error('Other writer started'); });
      `,
            ],
            { encoding: 'utf8' },
          );
          assert.ifError(otherWriter.error);
          assert.notEqual(otherWriter.status, 0);
          assert.match(otherWriter.stderr, /EEXIST/);
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

test('bundle provenance uses its checkout despite inherited Git repository overrides', () => {
  fixture(root => {
    const checkout = builderCheckout(root);
    const other = path.join(root, 'other');
    fs.mkdirSync(other);
    fixtureGit(other, ['init', '--quiet']);
    fixtureGit(other, [
      '-c',
      'user.name=Bundle fixture',
      '-c',
      'user.email=bundle@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'Unrelated checkout',
    ]);
    const revision = fixtureGit(checkout, ['rev-parse', 'HEAD'])
      .toString()
      .trim();
    assert.notEqual(
      revision,
      fixtureGit(other, ['rev-parse', 'HEAD']).toString().trim(),
    );
    assert.equal(fixtureGit(other, ['status', '--porcelain']).length, 0);
    assert(fixtureGit(checkout, ['status', '--porcelain']).length > 0);
    const overrides = {
      GIT_DIR: path.join(other, '.git'),
      GIT_COMMON_DIR: path.join(other, '.git'),
      GIT_WORK_TREE: other,
      GIT_INDEX_FILE: path.join(other, '.git', 'index'),
    };
    const previous = Object.fromEntries(
      Object.keys(overrides).map(name => [name, process.env[name]]),
    );
    try {
      Object.assign(process.env, overrides);
      const output = path.join(root, 'output');
      buildPluginInstallBundle(checkout, output, args =>
        fixturePacker(root, checkout, args),
      );
      assert.deepEqual(verifyPluginInstallBundle(output).source, {
        revision,
        dirty: true,
      });
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
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

test('packed plugin must declare forwarding, without requiring an exact version pin', () => {
  fixture((root, bundle, save) => {
    const plugin = bundle.packages['@internal/plugin-radius'];
    for (const range of [undefined, '', '^0.1.0', '~0.1.0']) {
      packFixture(
        root,
        plugin.path,
        '@internal/plugin-radius',
        plugin.version,
        {
          '@radius-project/core': '0.1.0',
          '@radius-project/graph-react': '0.1.0',
          ...(range === undefined
            ? {}
            : { '@radapp.io/rad-components': range }),
        },
      );
      plugin.sha256 = bundleFileSha256(path.join(root, plugin.path));
      bundle.files[plugin.path] = plugin.sha256;
      save();
      if (range) verifyPluginInstallBundle(root);
      else
        assert.throws(
          () => verifyPluginInstallBundle(root),
          /must declare its forwarding dependency/,
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
  for (const collision of [
    'archive',
    'directory',
    'empty-directory',
    'checksum',
  ]) {
    fixture(root => {
      const checkout = builderCheckout(root);
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
          buildPluginInstallBundle(checkout, output, args => {
            if (args[0] === 'tsc') {
              if (collision === 'directory' || collision === 'empty-directory')
                fs.mkdirSync(output);
              if (collision !== 'empty-directory')
                fs.writeFileSync(marker, 'other build output');
            }
            fixturePacker(root, checkout, args);
          }),
        error => {
          assert(error instanceof Error);
          assert.doesNotMatch(error.message, /\.radius-plugin-pack\.lock/);
          assert('code' in error);
          assert.match(String(error.code), /^(EEXIST|ENOTEMPTY|EPERM|EACCES)$/);
          const destination =
            'dest' in error
              ? error.dest
              : 'path' in error
                ? error.path
                : undefined;
          assert.equal(
            destination,
            collision === 'archive'
              ? archive
              : collision === 'checksum'
                ? `${archive}.sha256`
                : output,
          );
          return true;
        },
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
