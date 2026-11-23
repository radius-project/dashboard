import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface PluginInstallBundle {
  formatVersion: 1;
  source: { revision: string; dirty: boolean };
  toolchain: { node: string; packageManager: string };
  packages: Record<string, { path: string; version: string; sha256: string }>;
  files: Record<string, string>;
}

export const bundlePackageNames = [
  '@internal/plugin-radius',
  '@radius-project/core',
  '@radius-project/graph-react',
  '@radapp.io/rad-components',
] as const;

export const bundleFileSha256 = (file: string) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function pluginInstallSettings(bundle: PluginInstallBundle) {
  const dependency = (name: string, prefix: string) =>
    `file:${prefix}/radius-plugin-bundle/${bundle.packages[name].path}`;
  return {
    app: {
      dependencies: {
        '@internal/plugin-radius': dependency(
          '@internal/plugin-radius',
          '../..',
        ),
      },
    },
    root: {
      resolutions: Object.fromEntries(
        bundlePackageNames.slice(1).map(name => [name, dependency(name, '.')]),
      ),
    },
  };
}

export function verifyPluginInstallBundle(directory: string) {
  assert(
    fs.lstatSync(directory).isDirectory(),
    'Expected a real plugin bundle directory',
  );
  const manifest = path.join(directory, 'bundle.json');
  assert(
    fs.lstatSync(manifest).isFile(),
    'Expected a regular bundle.json file',
  );
  const bundle: PluginInstallBundle = JSON.parse(
    fs.readFileSync(manifest, 'utf8'),
  );
  assert.equal(bundle.formatVersion, 1, 'Unsupported plugin bundle format');
  assert.match(bundle.source.revision, /^[a-f0-9]{40}$/);
  assert.equal(typeof bundle.source.dirty, 'boolean');
  assert.equal(typeof bundle.toolchain.node, 'string');
  assert.equal(typeof bundle.toolchain.packageManager, 'string');
  assert.deepEqual(
    Object.keys(bundle.packages).sort(),
    [...bundlePackageNames].sort(),
    'Expected the plugin, forwarding package and two shared packages',
  );
  const expectedFiles = [
    'README.md',
    'verify.mts',
    'install-settings.json',
    'archives/candidate.json',
    ...bundlePackageNames.map(name => bundle.packages[name].path),
  ];
  assert.equal(new Set(expectedFiles).size, 8, 'Duplicate bundle paths');
  assert.deepEqual(Object.keys(bundle.files).sort(), expectedFiles.sort());
  assert(
    fs.lstatSync(path.join(directory, 'archives')).isDirectory(),
    'Expected a real archives directory',
  );
  for (const [file, digest] of Object.entries(bundle.files)) {
    assert.match(
      file,
      /^(?:README\.md|verify\.mts|install-settings\.json|archives\/[a-zA-Z0-9._-]+(?:\.tgz|\.json))$/,
      'Invalid bundle path',
    );
    const absolute = path.join(directory, file);
    assert(fs.lstatSync(absolute).isFile(), `${file}: expected a regular file`);
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(
      bundleFileSha256(absolute),
      digest,
      `${file}: SHA-256 mismatch`,
    );
  }
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    [
      'bundle.json',
      'archives',
      ...expectedFiles.filter(file => !file.includes('/')),
    ].sort(),
    'Unexpected bundle root entries',
  );
  assert.deepEqual(
    fs.readdirSync(path.join(directory, 'archives')).sort(),
    expectedFiles
      .filter(file => file.startsWith('archives/'))
      .map(file => path.basename(file))
      .sort(),
    'Unexpected bundle archive entries',
  );
  let pluginDependencies: Record<string, string> | undefined;
  for (const [name, artifact] of Object.entries(bundle.packages)) {
    assert.match(artifact.path, /^archives\/[a-zA-Z0-9._-]+\.tgz$/);
    assert.equal(typeof artifact.version, 'string');
    assert(artifact.version.length > 0, `${name}: missing version`);
    assert.equal(artifact.sha256, bundle.files[artifact.path]);
    const packed = JSON.parse(
      execFileSync(
        'tar',
        [
          '-xOf',
          path.resolve(directory, artifact.path),
          '--',
          'package/package.json',
        ],
        { encoding: 'utf8' },
      ),
    );
    assert.equal(packed.name, name, `${name}: archive name mismatch`);
    assert.equal(
      packed.version,
      artifact.version,
      `${name}: archive version mismatch`,
    );
    if (name === '@internal/plugin-radius')
      pluginDependencies = packed.dependencies;
  }
  for (const dependency of [
    '@radius-project/core',
    '@radius-project/graph-react',
  ])
    assert.equal(
      pluginDependencies?.[dependency],
      bundle.packages[dependency].version,
      `${dependency}: plugin dependency mismatch`,
    );
  const candidate = JSON.parse(
    fs.readFileSync(path.join(directory, 'archives', 'candidate.json'), 'utf8'),
  );
  for (const [name, identity] of [
    ['@radius-project/core', candidate.core],
    ['@radius-project/graph-react', candidate.graphReact],
  ] as const) {
    assert.equal(bundle.packages[name].path, `archives/${identity.path}`);
    assert.equal(bundle.packages[name].sha256, identity.sha256);
  }
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(path.join(directory, 'install-settings.json'), 'utf8'),
    ),
    pluginInstallSettings(bundle),
    'Install settings do not select the bundle packages',
  );
  return bundle;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const directory =
    process.argv[2] ?? path.dirname(path.resolve(process.argv[1]));
  const bundle = verifyPluginInstallBundle(directory);
  console.log(
    `Verified plugin bundle from ${bundle.source.revision}${bundle.source.dirty ? ' (modified source)' : ''}. Checksums are not a publisher signature or host qualification.`,
  );
}
