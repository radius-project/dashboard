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
import {
  bundleReleaseContext,
  preparePluginReleaseAssets,
  publishPluginReleaseAssets,
  type BundleReleaseContext,
} from './release-plugin-bundle.ts';

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

const releaseContext: BundleReleaseContext = {
  tag: 'v0.63.0-rc.1',
  revision: 'a'.repeat(40),
  workflowRunUrl:
    'https://github.com/radius-project/dashboard/actions/runs/123',
};

function qualifiedFixture(
  run: (root: string, evidence: string, record: string) => void,
) {
  fixture((root, bundle) => {
    const evidence = path.join(root, 'evidence');
    const record = path.join(evidence, 'installed-host-test');
    const directory = path.join(record, 'radius-plugin-bundle');
    fs.mkdirSync(path.join(directory, 'archives'), { recursive: true });
    for (const file of ['bundle.json', ...Object.keys(bundle.files)])
      fs.copyFileSync(path.join(root, file), path.join(directory, file));
    execFileSync('tar', [
      '-czf',
      path.join(record, 'bundle-build.tar.gz'),
      '-C',
      directory,
      '.',
    ]);
    fs.writeFileSync(
      path.join(record, 'qualification.json'),
      JSON.stringify({
        stage: 'installed-external-frontend',
        bundle: {
          manifestSha256: bundleFileSha256(path.join(directory, 'bundle.json')),
          ...bundle,
        },
        entries: ['@internal/plugin-radius', '@internal/plugin-radius/alpha'],
        node: 'v24.22.0',
        packageManager: 'yarn@4.18.1',
        compiler: '6.0.3',
        installedLockSha256: 'c'.repeat(64),
        rawLogs: 'must not be published',
      }),
    );
    run(root, evidence, record);
  });
}

test('release assets preserve the tested transfer bytes and omit raw qualification data', () => {
  qualifiedFixture((root, evidence, record) => {
    const output = path.join(root, 'release');
    preparePluginReleaseAssets(evidence, output, releaseContext);
    const files = fs.readdirSync(output);
    assert.equal(files.length, 3);
    const archive = files.find(file => file.endsWith('.tar.gz'))!;
    assert.equal(
      bundleFileSha256(path.join(output, archive)),
      bundleFileSha256(path.join(record, 'bundle-build.tar.gz')),
    );
    assert.equal(
      fs.readFileSync(path.join(output, `${archive}.sha256`), 'utf8'),
      `${bundleFileSha256(path.join(output, archive))}  ${archive}\n`,
    );
    const proof = fs.readFileSync(
      path.join(
        output,
        'radius-backstage-plugin-v0.63.0-rc.1.qualification.json',
      ),
      'utf8',
    );
    assert(!proof.includes('rawLogs'));
    assert(!proof.includes(record));
    assert.match(proof, /actions\/runs\/123/);
  });
});

test('release preparation rejects missing qualification, a different commit, modified source and altered transfer bytes', () => {
  qualifiedFixture((root, evidence, record) => {
    const output = path.join(root, 'release');
    assert.throws(
      () =>
        preparePluginReleaseAssets(evidence, output, {
          ...releaseContext,
          revision: 'b'.repeat(40),
        }),
      /release commit/,
    );
    const receipt = path.join(record, 'qualification.json');
    const qualification = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    const manifestFile = path.join(
      record,
      'radius-plugin-bundle',
      'bundle.json',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.source.dirty = true;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    qualification.bundle = {
      manifestSha256: bundleFileSha256(manifestFile),
      ...manifest,
    };
    fs.writeFileSync(receipt, JSON.stringify(qualification));
    assert.throws(
      () => preparePluginReleaseAssets(evidence, output, releaseContext),
      /Modified-source/,
    );
    manifest.source.dirty = false;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    qualification.bundle = {
      manifestSha256: bundleFileSha256(manifestFile),
      ...manifest,
    };
    fs.writeFileSync(receipt, JSON.stringify(qualification));
    fs.writeFileSync(
      path.join(root, 'archives', 'plugin.tgz'),
      'changed after qualification',
    );
    execFileSync('tar', [
      '-czf',
      path.join(record, 'bundle-build.tar.gz'),
      '-C',
      root,
      'archives',
      'bundle.json',
      'README.md',
      'verify.ts',
      'install-settings.json',
    ]);
    assert.throws(
      () => preparePluginReleaseAssets(evidence, output, releaseContext),
      /transfer archive differs/,
    );
    fs.unlinkSync(receipt);
    assert.throws(
      () => preparePluginReleaseAssets(evidence, output, releaseContext),
      /exactly one successful/,
    );
    assert(!fs.existsSync(output));
  });
});

function releaseServer(directory: string) {
  const calls: string[][] = [];
  const files = new Map<number, string>();
  const assets: { id: number; name: string; digest?: string }[] = [];
  return {
    calls,
    assets,
    gh(args: string[]) {
      calls.push(args);
      if (args[0] === 'api' && args[1].includes('/releases/tags/'))
        return Buffer.from(
          JSON.stringify({ tag_name: releaseContext.tag, assets }),
        );
      if (args[0] === 'api' && args[1].includes('/releases/assets/'))
        return fs.readFileSync(files.get(Number(args[1].split('/').at(-1)))!);
      assert.deepEqual(args.slice(0, 3), [
        'release',
        'upload',
        releaseContext.tag,
      ]);
      assert(!args.includes('--clobber'));
      for (const file of args.slice(3, -2)) {
        const id = assets.length + 1;
        files.set(id, file);
        assets.push({
          id,
          name: path.basename(file),
          digest: `sha256:${bundleFileSha256(file)}`,
        });
      }
      return Buffer.from('');
    },
    retain(name: string) {
      const file = path.join(directory, name);
      const id = assets.length + 1;
      files.set(id, file);
      assets.push({ id, name });
    },
  };
}

test('release publication uploads only missing assets and checks stored bytes, including older assets without server digests', () => {
  qualifiedFixture((root, evidence) => {
    const output = path.join(root, 'release');
    preparePluginReleaseAssets(evidence, output, releaseContext);
    const server = releaseServer(output);
    server.retain(fs.readdirSync(output)[0]);
    const names = publishPluginReleaseAssets(output, releaseContext, server.gh);
    assert.equal(names.length, 3);
    assert.equal(server.calls.filter(args => args[0] === 'release').length, 1);
    assert.equal(
      server.calls.find(args => args[0] === 'release')!.slice(3, -2).length,
      2,
    );
    assert(server.calls.some(args => args[1].includes('/releases/assets/')));
    publishPluginReleaseAssets(output, releaseContext, server.gh);
    assert.equal(server.calls.filter(args => args[0] === 'release').length, 1);
    server.assets.pop();
    assert.throws(
      () =>
        publishPluginReleaseAssets(output, releaseContext, args => {
          const result = server.gh(args);
          if (args[0] === 'release') server.assets.pop();
          return result;
        }),
      /did not retain all release assets/,
    );
  });
});

test('release publication refuses changed local assets, conflicting remote assets and missing releases without overwriting or creating a release', () => {
  qualifiedFixture((root, evidence) => {
    const output = path.join(root, 'release');
    preparePluginReleaseAssets(evidence, output, releaseContext);
    const server = releaseServer(output);
    server.assets.push({
      id: 1,
      name: fs.readdirSync(output)[0],
      digest: `sha256:${'f'.repeat(64)}`,
    });
    assert.throws(
      () => publishPluginReleaseAssets(output, releaseContext, server.gh),
      /Refusing to overwrite/,
    );
    assert(!server.calls.some(args => args[0] === 'release'));
    assert.throws(
      () =>
        publishPluginReleaseAssets(output, releaseContext, () => {
          throw new Error('GitHub release not found');
        }),
      /release not found/,
    );
    fs.appendFileSync(
      path.join(output, 'radius-backstage-plugin-v0.63.0-rc.1.tar.gz'),
      'corruption',
    );
    assert.throws(
      () => publishPluginReleaseAssets(output, releaseContext, server.gh),
      /archive SHA-256 mismatch/,
    );
  });
});

test('publication context rejects pull requests, forks, branches and invalid release tags', () => {
  const env = {
    GITHUB_REPOSITORY: 'radius-project/dashboard',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/tags/v0.63.0-rc.1',
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123',
  };
  assert.deepEqual(bundleReleaseContext(env), releaseContext);
  for (const override of [
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REPOSITORY: 'someone/dashboard' },
    { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_REF: 'refs/tags/not-a-version' },
  ])
    assert.throws(() => bundleReleaseContext({ ...env, ...override }));
});
