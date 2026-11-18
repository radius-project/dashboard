import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  bundleFileSha256,
  verifyPluginInstallBundle,
  type PluginInstallBundle,
} from './verify-plugin-bundle.ts';

const repository = 'radius-project/dashboard';
const entries = ['@internal/plugin-radius', '@internal/plugin-radius/alpha'];
const stage = 'installed-external-frontend';
const digest = (content: Buffer) =>
  createHash('sha256').update(content).digest('hex');

export interface BundleReleaseContext {
  tag: string;
  revision: string;
  workflowRunUrl: string;
}

interface ReleaseQualification {
  stage: string;
  archiveSha256: string;
  bundleManifestSha256: string;
  bundle: PluginInstallBundle;
  entries: string[];
  node: string;
  packageManager: string;
  compiler: string;
  installedLockSha256: string;
  workflowRunUrl: string;
}

export function bundleReleaseContext(
  env: NodeJS.ProcessEnv,
): BundleReleaseContext {
  assert.equal(
    env.GITHUB_REPOSITORY,
    repository,
    'Only the upstream repository may publish bundles',
  );
  assert.equal(
    env.GITHUB_EVENT_NAME,
    'push',
    'Bundle publication requires a tag push',
  );
  const tag = env.GITHUB_REF?.replace(/^refs\/tags\//, '');
  assert(
    tag && env.GITHUB_REF === `refs/tags/${tag}`,
    'Expected a release tag',
  );
  assert.match(
    tag,
    /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  assert(
    env.GITHUB_SHA && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA),
    'Expected the release commit',
  );
  assert(
    env.GITHUB_RUN_ID && /^\d+$/.test(env.GITHUB_RUN_ID),
    'Expected the release workflow run',
  );
  return {
    tag,
    revision: env.GITHUB_SHA,
    workflowRunUrl: `https://github.com/${repository}/actions/runs/${env.GITHUB_RUN_ID}`,
  };
}

function assetNames(tag: string) {
  assert.match(tag, /^v[0-9A-Za-z.-]+$/);
  const archive = `radius-backstage-plugin-${tag}.tar.gz`;
  return {
    archive,
    checksum: `${archive}.sha256`,
    qualification: `radius-backstage-plugin-${tag}.qualification.json`,
  };
}

function verifyArchive(
  archive: string,
  bundle: PluginInstallBundle,
  manifestSha256: string,
) {
  const members = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(member => member && !member.endsWith('/'));
  const normalized = members.map(member => member.replace(/^\.\//, ''));
  assert.deepEqual(
    normalized.slice().sort(),
    ['bundle.json', ...Object.keys(bundle.files)].sort(),
    'Transfer archive contains unexpected or missing files',
  );
  for (const [index, member] of members.entries()) {
    const bytes = execFileSync('tar', ['-xOf', archive, member], {
      maxBuffer: 32 * 1024 * 1024,
    });
    const expected =
      normalized[index] === 'bundle.json'
        ? manifestSha256
        : bundle.files[normalized[index]];
    assert.equal(
      digest(bytes),
      expected,
      `${member}: transfer archive differs from the qualified bundle`,
    );
  }
}

function verifyQualification(
  qualification: ReleaseQualification,
  context: BundleReleaseContext,
) {
  assert.equal(
    qualification.stage,
    stage,
    'Expected successful clean frontend qualification',
  );
  assert.deepEqual(qualification.entries, entries);
  assert.equal(
    qualification.bundle.source.revision,
    context.revision,
    'Bundle is not from the release commit',
  );
  assert.equal(
    qualification.bundle.source.dirty,
    false,
    'Modified-source bundles must not be released',
  );
  assert.match(qualification.archiveSha256, /^[a-f0-9]{64}$/);
  assert.match(qualification.bundleManifestSha256, /^[a-f0-9]{64}$/);
  assert.match(qualification.installedLockSha256, /^[a-f0-9]{64}$/);
  for (const value of [
    qualification.node,
    qualification.packageManager,
    qualification.compiler,
  ])
    assert(
      typeof value === 'string' && value.length > 0,
      'Missing qualified toolchain',
    );
  assert.match(
    qualification.workflowRunUrl,
    /^https:\/\/github\.com\/radius-project\/dashboard\/actions\/runs\/\d+$/,
  );
  assert.equal(
    qualification.workflowRunUrl,
    context.workflowRunUrl,
    'Qualification is from another workflow run',
  );
}

export function preparePluginReleaseAssets(
  evidence: string,
  output: string,
  context: BundleReleaseContext,
) {
  assert(!fs.existsSync(output), 'Release asset output must not already exist');
  const records = fs
    .readdirSync(evidence, { withFileTypes: true })
    .filter(
      entry => entry.isDirectory() && entry.name.startsWith('installed-host-'),
    )
    .map(entry => path.join(evidence, entry.name))
    .filter(directory =>
      fs.existsSync(path.join(directory, 'qualification.json')),
    );
  assert.equal(
    records.length,
    1,
    'Expected exactly one successful bundle qualification',
  );
  const record = records[0];
  const qualified = JSON.parse(
    fs.readFileSync(path.join(record, 'qualification.json'), 'utf8'),
  );
  const directory = path.join(record, 'radius-plugin-bundle');
  const bundle = verifyPluginInstallBundle(directory);
  const manifestSha256 = bundleFileSha256(path.join(directory, 'bundle.json'));
  assert.deepEqual(
    qualified.bundle,
    { manifestSha256, ...bundle },
    'Qualification does not bind this bundle',
  );
  const archive = path.join(record, 'bundle-build.tar.gz');
  const qualification: ReleaseQualification = {
    stage: qualified.stage,
    archiveSha256: bundleFileSha256(archive),
    bundleManifestSha256: manifestSha256,
    bundle,
    entries: qualified.entries,
    node: qualified.node,
    packageManager: qualified.packageManager,
    compiler: qualified.compiler,
    installedLockSha256: qualified.installedLockSha256,
    workflowRunUrl: context.workflowRunUrl,
  };
  verifyQualification(qualification, context);
  verifyArchive(archive, bundle, manifestSha256);
  const names = assetNames(context.tag);
  fs.mkdirSync(output, { recursive: true });
  fs.copyFileSync(archive, path.join(output, names.archive));
  fs.writeFileSync(
    path.join(output, names.checksum),
    `${qualification.archiveSha256}  ${names.archive}\n`,
  );
  fs.writeFileSync(
    path.join(output, names.qualification),
    `${JSON.stringify(qualification, null, 2)}\n`,
  );
}

type RunGh = (args: string[]) => Buffer;
const runGh: RunGh = args =>
  execFileSync('gh', args, { maxBuffer: 32 * 1024 * 1024 });

export function publishPluginReleaseAssets(
  directory: string,
  context: BundleReleaseContext,
  gh: RunGh = runGh,
) {
  const names = assetNames(context.tag);
  const qualification: ReleaseQualification = JSON.parse(
    fs.readFileSync(path.join(directory, names.qualification), 'utf8'),
  );
  verifyQualification(qualification, context);
  const archive = path.join(directory, names.archive);
  assert.equal(
    bundleFileSha256(archive),
    qualification.archiveSha256,
    'Release archive SHA-256 mismatch',
  );
  assert.equal(
    fs.readFileSync(path.join(directory, names.checksum), 'utf8'),
    `${qualification.archiveSha256}  ${names.archive}\n`,
    'Release checksum does not match the archive',
  );
  verifyArchive(
    archive,
    qualification.bundle,
    qualification.bundleManifestSha256,
  );
  const checkAssets = () => {
    const release: {
      tag_name: string;
      assets: { id: number; name: string; digest?: string }[];
    } = JSON.parse(
      gh(['api', `repos/${repository}/releases/tags/${context.tag}`]).toString(
        'utf8',
      ),
    );
    assert.equal(
      release.tag_name,
      context.tag,
      'GitHub returned a different release',
    );
    const missing: string[] = [];
    for (const name of Object.values(names)) {
      const matches = release.assets.filter(asset => asset.name === name);
      assert(matches.length <= 1, `Duplicate release asset: ${name}`);
      const asset = matches[0];
      const file = path.join(directory, name);
      if (!asset) {
        missing.push(file);
        continue;
      }
      assert(
        Number.isSafeInteger(asset.id) && asset.id > 0,
        'Invalid release asset identity',
      );
      const remoteDigest =
        asset.digest ??
        `sha256:${digest(
          gh([
            'api',
            `repos/${repository}/releases/assets/${asset.id}`,
            '--header',
            'Accept: application/octet-stream',
          ]),
        )}`;
      assert.equal(
        remoteDigest,
        `sha256:${bundleFileSha256(file)}`,
        `Refusing to overwrite different release asset: ${name}`,
      );
    }
    return missing;
  };
  const missing = checkAssets();
  if (missing.length) {
    gh(['release', 'upload', context.tag, ...missing, '--repo', repository]);
    assert.deepEqual(
      checkAssets(),
      [],
      'GitHub did not retain all release assets',
    );
  }
  return Object.values(names);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [command, first, second] = process.argv.slice(2);
  const context = bundleReleaseContext(process.env);
  if (command === 'prepare') {
    assert(first && second, 'Expected evidence and new asset directories');
    preparePluginReleaseAssets(first, second, context);
    console.log(`Prepared the qualified plugin bundle for ${context.tag}`);
  } else if (command === 'publish') {
    assert(first, 'Expected the downloaded release asset directory');
    const names = publishPluginReleaseAssets(first, context);
    console.log(
      `Verified release assets on ${context.tag}: ${names.join(', ')}`,
    );
  } else {
    throw new Error('Expected prepare or publish');
  }
}
