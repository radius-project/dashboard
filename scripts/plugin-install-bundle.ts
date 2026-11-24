import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withWorkspaceManifest } from '../plugins/plugin-radius/workspace-manifest.ts';
import { isInsidePath } from './installed-host.ts';
import {
  verifySharedLibraryCandidate,
  type SharedLibraryCandidate,
} from './shared-library-candidate.ts';
import {
  bundleFileSha256,
  pluginInstallSettings,
  verifyPluginInstallBundle,
  type PluginInstallBundle,
} from './verify-plugin-bundle.ts';

export type RunYarn = (args: string[]) => string | void;

export function yarnInvocation(args: string[]) {
  const yarn = process.env.COREPACK_ROOT
    ? path.join(process.env.COREPACK_ROOT, 'dist', 'yarn.js')
    : process.env.npm_execpath;
  assert(yarn, 'Run this command through Yarn');
  return /\.[cm]?js$/.test(yarn)
    ? { command: process.execPath, args: [yarn, ...args] }
    : { command: yarn, args };
}

export function packWorkspace(
  root: string,
  workspace: string,
  file: string,
  runYarn: RunYarn,
) {
  return withWorkspaceManifest(root, workspace, (before, startPack) => {
    const manifest = JSON.parse(before);
    runYarn(['workspace', manifest.name, 'build']);
    startPack();
    runYarn(['workspace', manifest.name, 'pack', '--out', file]);
    return manifest;
  });
}

export function buildPluginInstallBundle(
  root: string,
  output: string,
  runYarn: RunYarn,
) {
  output = path.resolve(output);
  assert(
    !isInsidePath(root, output),
    'The plugin bundle output must be outside the checkout',
  );
  const archive = `${output}.tar.gz`;
  for (const file of [output, archive, `${archive}.sha256`]) {
    assert(!fs.existsSync(file), `Refusing to overwrite ${file}`);
  }
  const gitEnv: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_COUNT: '0' };
  for (const name of [
    'GIT_DIR',
    'GIT_COMMON_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
  ])
    delete gitEnv[name];
  const git = (args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      env: gitEnv,
      encoding: 'utf8',
    }).trim();
  const sourceState = () => ({
    revision: git(['rev-parse', 'HEAD']),
    dirty:
      git(['status', '--porcelain', '--untracked-files=normal']).length > 0,
  });
  const source = sourceState();
  const repository = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const yarnVersion = runYarn(['--version']);
  assert(
    typeof yarnVersion === 'string' &&
      /^yarn@\d+\.\d+\.\d+$/.test(repository.packageManager),
    'Expected a Yarn version and an exact repository packageManager',
  );
  const packageManager = `yarn@${yarnVersion.trim()}`;
  assert.equal(
    packageManager,
    repository.packageManager,
    'Yarn version does not match the repository packageManager',
  );
  const candidateDirectory = path.join(root, 'vendor', 'shared-libraries');
  const candidateFile = path.join(candidateDirectory, 'candidate.json');
  const candidate: SharedLibraryCandidate = JSON.parse(
    fs.readFileSync(candidateFile, 'utf8'),
  );
  for (const identity of [candidate.core, candidate.graphReact])
    assert.match(identity.path, /^[a-zA-Z0-9._-]+\.tgz$/);
  const shared = verifySharedLibraryCandidate(candidate, candidateDirectory);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const staging = fs.mkdtempSync(
    path.join(path.dirname(output), '.radius-bundle-'),
  );
  const stagedArchive = path.join(staging, 'bundle.tar.gz');
  const contents = path.join(staging, 'contents');
  fs.mkdirSync(path.join(contents, 'archives'), { recursive: true });
  const published: string[] = [];
  try {
    runYarn(['tsc']);
    const pluginPath = 'archives/plugin-radius.tgz';
    const plugin = packWorkspace(
      root,
      'plugins/plugin-radius',
      path.join(contents, pluginPath),
      runYarn,
    );
    const packages: PluginInstallBundle['packages'] = {
      [plugin.name]: {
        path: pluginPath,
        version: plugin.version,
        sha256: bundleFileSha256(path.join(contents, pluginPath)),
      },
    };
    const forwardingPath = 'archives/forwarding.tgz';
    const forwarding = packWorkspace(
      root,
      'packages/rad-components',
      path.join(contents, forwardingPath),
      runYarn,
    );
    packages[forwarding.name] = {
      path: forwardingPath,
      version: forwarding.version,
      sha256: bundleFileSha256(path.join(contents, forwardingPath)),
    };
    for (const [name, identity, version] of [
      ['@radius-project/core', candidate.core, shared.core.version],
      [
        '@radius-project/graph-react',
        candidate.graphReact,
        shared.graphReact.version,
      ],
    ] as const) {
      assert.equal(
        plugin.dependencies[name],
        version,
        `${name}: plugin dependency mismatch`,
      );
      const file = `archives/${identity.path}`;
      fs.copyFileSync(
        path.join(candidateDirectory, identity.path),
        path.join(contents, file),
      );
      packages[name] = { path: file, version, sha256: identity.sha256 };
    }
    fs.copyFileSync(
      candidateFile,
      path.join(contents, 'archives', 'candidate.json'),
    );
    fs.copyFileSync(
      path.join(root, 'scripts', 'verify-plugin-bundle.ts'),
      path.join(contents, 'verify.mts'),
    );
    const bundle: PluginInstallBundle = {
      formatVersion: 1,
      source,
      toolchain: {
        node: process.version,
        packageManager,
      },
      packages,
      files: {},
    };
    fs.writeFileSync(
      path.join(contents, 'install-settings.json'),
      `${JSON.stringify(pluginInstallSettings(bundle), null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(contents, 'README.md'),
      `# Radius Backstage plugin install bundle

This is a private development build, not a public package release.
Source: ${bundle.source.revision}${bundle.source.dirty ? ' (modified source)' : ''}.
Built with ${bundle.toolchain.node} and ${bundle.toolchain.packageManager}.
Checksums detect changed bytes; they do not prove publisher identity.

1. Copy this complete directory to the portal root as radius-plugin-bundle.
2. With Node.js 24 and tar installed, run:
   node radius-plugin-bundle/verify.mts
3. Merge install-settings.json's app.dependencies into packages/app/package.json
   and root.resolutions into the portal root package.json. Preserve existing
   settings. If a Radius dependency or resolution already exists, review it first.
   The paths assume the standard packages/app workspace; adjust them together if
   your layout differs. Before adding the bundle to Git, add this rule to the
   portal-root .gitattributes, outside the bundle:
   radius-plugin-bundle/** -text
   This preserves the hashed bytes when core.autocrlf is enabled. Keep the bundle
   with the portal source for later installs. Do not add files inside the bundle.
4. Run the portal's Yarn install and normal build. Do not copy Dashboard's full
   package manifest or lockfile. This bundle supplies overrides for the forwarding
   package and two Radius libraries; keep the portal's other dependency policies.
5. Register the native frontend feature from @internal/plugin-radius/alpha and
   @backstage/plugin-kubernetes/alpha, or use the legacy root page exports.
   Use the portal's navigation and route refs. Configure its Kubernetes backend
   and Radius access. Keep credentials on the backend, not in frontend config.

The package requires React and ReactDOM ${plugin.peerDependencies.react}, and
react-router-dom ${plugin.peerDependencies['react-router-dom']}. React 19 is not
qualified. Existing host auth and Kubernetes policy remain required for resource
GET and graph POST requests. Do not copy Dashboard's guest auth into production.
The default client uses the first configured cluster and the radius/local plane;
use the public API override for another connection.

Setup reference: https://docs.radapp.io/integrations/backstage/
Source and current contracts: https://github.com/radius-project/dashboard/tree/${bundle.source.revision}/plugins/plugin-radius

Building this bundle alone does not qualify a host. Maintainers test its exact
bytes with QUALIFICATION_PLUGIN_BUNDLE and yarn test:e2e:installed. The resulting
qualification receipt records the bundle digest, dependency versions, compiler,
lockfile and controlled browser journeys. It is not production auth approval or
a broad Backstage support promise.
`,
    );
    for (const file of [
      'README.md',
      'verify.mts',
      'install-settings.json',
      'archives/candidate.json',
      ...Object.values(packages).map(identity => identity.path),
    ])
      bundle.files[file] = bundleFileSha256(path.join(contents, file));
    fs.writeFileSync(
      path.join(contents, 'bundle.json'),
      `${JSON.stringify(bundle, null, 2)}\n`,
    );
    verifyPluginInstallBundle(contents);
    execFileSync('tar', ['-czf', stagedArchive, '-C', contents, '.']);
    const digest = bundleFileSha256(stagedArchive);
    const finalSource = sourceState();
    assert.equal(
      finalSource.revision,
      source.revision,
      'Source revision changed while building the plugin bundle',
    );
    assert(
      source.dirty || !finalSource.dirty,
      'Source became modified while building the plugin bundle',
    );
    fs.linkSync(stagedArchive, archive);
    published.push(archive);
    fs.mkdirSync(output);
    published.push(output);
    for (const entry of fs.readdirSync(contents))
      fs.renameSync(path.join(contents, entry), path.join(output, entry));
    const checksum = fs.openSync(`${archive}.sha256`, 'wx');
    published.push(`${archive}.sha256`);
    try {
      fs.writeFileSync(checksum, `${digest}  ${path.basename(archive)}\n`);
    } finally {
      fs.closeSync(checksum);
    }
    return { directory: output, archive, sha256: digest };
  } catch (error) {
    for (const file of published.reverse())
      fs.rmSync(file, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(fileURLToPath(import.meta.url)) ===
    fs.realpathSync(process.argv[1])
) {
  const output = process.argv[2];
  assert(
    output,
    'Usage: yarn bundle:plugin <new-output-directory-outside-checkout>',
  );
  const result = buildPluginInstallBundle(process.cwd(), output, args => {
    const invocation = yarnInvocation(args);
    if (args[0] === '--version')
      return execFileSync(invocation.command, invocation.args, {
        encoding: 'utf8',
      });
    execFileSync(invocation.command, invocation.args, { stdio: 'inherit' });
  });
  console.log(
    `Plugin install bundle: ${result.archive}\nSHA-256: ${result.sha256}`,
  );
}
