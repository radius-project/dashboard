import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  assertCandidateResolution,
  assertInstalledReact18,
  installedPackage,
  sha256,
} from './installed-host.ts';
import {
  verifySharedLibraryCandidate,
  type SharedLibraryCandidate,
} from './shared-library-candidate.ts';

const root = process.cwd();
const evidence = process.env.QUALIFICATION_EVIDENCE_DIRECTORY;
if (!evidence || !path.isAbsolute(evidence)) {
  throw new Error(
    'Set QUALIFICATION_EVIDENCE_DIRECTORY to a persistent absolute directory',
  );
}
fs.mkdirSync(evidence, { recursive: true });
const relativeEvidence = path.relative(
  fs.realpathSync(root),
  fs.realpathSync(evidence),
);
if (
  relativeEvidence === '' ||
  (!relativeEvidence.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativeEvidence))
) {
  throw new Error(
    'Installed-host evidence must be outside the repository dependency tree',
  );
}
const recordDirectory = fs.mkdtempSync(path.join(evidence, 'installed-host-'));
const workDirectory = process.env.QUALIFICATION_WORK_DIRECTORY;
if (workDirectory && !path.isAbsolute(workDirectory)) {
  throw new Error('QUALIFICATION_WORK_DIRECTORY must be absolute');
}
if (workDirectory) fs.mkdirSync(workDirectory, { recursive: true });
if (workDirectory) {
  const relativeWork = path.relative(
    fs.realpathSync(root),
    fs.realpathSync(workDirectory),
  );
  assert(
    relativeWork.startsWith(`..${path.sep}`) || path.isAbsolute(relativeWork),
    'Installed-host work directory must be outside the repository dependency tree',
  );
}
const consumer = workDirectory
  ? fs.mkdtempSync(path.join(workDirectory, 'installed-host-'))
  : recordDirectory;
const archives = path.join(consumer, 'archives');
fs.mkdirSync(archives);
const commands: {
  command: string[];
  cwd: string;
  result: 'passed' | 'failed';
  log: string;
}[] = [];
const yarn = process.env.npm_execpath;
if (!yarn)
  throw new Error('Run this qualification through yarn test:e2e:installed');

function run(
  command: string,
  args: string[],
  cwd = root,
  env: NodeJS.ProcessEnv = {},
) {
  const log = path.join(recordDirectory, `command-${commands.length + 1}.log`);
  const fd = fs.openSync(log, 'w');
  const record = {
    command: [command, ...args],
    cwd,
    result: 'failed' as 'passed' | 'failed',
    log,
  };
  commands.push(record);
  try {
    execFileSync(command, args, {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        QUALIFICATION_EVIDENCE_DIRECTORY: recordDirectory,
        ...env,
      },
      stdio: ['ignore', fd, fd],
    });
    record.result = 'passed';
  } finally {
    fs.closeSync(fd);
    fs.writeFileSync(
      path.join(recordDirectory, 'commands.json'),
      `${JSON.stringify(commands, null, 2)}\n`,
    );
  }
}

const runYarn = (args: string[], cwd = root) => run(yarn!, args, cwd);
const repositoryManifest = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const receiptPath = path.join(
  root,
  'vendor',
  'shared-libraries',
  'candidate.json',
);
const candidate = JSON.parse(
  fs.readFileSync(receiptPath, 'utf8'),
) as SharedLibraryCandidate;
const candidateDirectory = path.dirname(receiptPath);
const artifacts: Record<string, { file: string; sha256: string }> = {};

try {
  // Backstage builds read the declarations emitted by the repository compiler.
  runYarn(['tsc']);
  for (const [name, workspace] of [
    ['plugin', 'plugins/plugin-radius'],
    ['forwarding', 'packages/rad-components'],
  ]) {
    const directory = path.join(root, workspace);
    const manifestFile = path.join(directory, 'package.json');
    const before = fs.readFileSync(manifestFile, 'utf8');
    const manifest = JSON.parse(before);
    const file = path.join(archives, `${name}.tgz`);
    try {
      runYarn(['workspace', manifest.name, 'build']);
      runYarn(['workspace', manifest.name, 'pack', '--out', file]);
    } finally {
      if (fs.readFileSync(manifestFile, 'utf8') !== before)
        fs.writeFileSync(manifestFile, before);
    }
    artifacts[manifest.name] = { file, sha256: sha256(file) };
  }
  for (const [name, archive] of [
    ['@radius-project/core', candidate.core],
    ['@radius-project/graph-react', candidate.graphReact],
  ] as const) {
    const file = path.join(archives, path.basename(archive.path));
    fs.copyFileSync(path.resolve(candidateDirectory, archive.path), file);
    artifacts[name] = { file, sha256: sha256(file) };
  }
  const dependencies: Record<string, string> = {};
  for (const name of [
    '@backstage/app-defaults',
    '@backstage/config',
    '@backstage/core-app-api',
    '@backstage/core-components',
    '@backstage/core-plugin-api',
    '@backstage/frontend-defaults',
    '@backstage/frontend-plugin-api',
    '@backstage/plugin-app-react',
    '@backstage/plugin-kubernetes',
    '@types/react',
    '@types/react-dom',
    'react',
    'react-dom',
    'reactflow',
    'react-router-dom',
    'typescript',
  ]) {
    dependencies[name] = installedPackage(root, name).manifest.version;
  }
  for (const [name, artifact] of Object.entries(artifacts)) {
    dependencies[name] = `file:./archives/${path.basename(artifact.file)}`;
  }
  fs.copyFileSync(receiptPath, path.join(archives, 'candidate.json'));
  fs.writeFileSync(
    path.join(consumer, 'tuple.json'),
    `${JSON.stringify(
      {
        node: process.version,
        packageManager: repositoryManifest.packageManager,
        repositoryLockSha256: sha256(path.join(root, 'yarn.lock')),
        compiler: dependencies.typescript,
        entries: ['@internal/plugin-radius', '@internal/plugin-radius/alpha'],
        auth: 'host-owned fixture identity; no automatic guest sign-in',
        backendAuth: process.env.QUALIFICATION_CONTAINER_IMAGE
          ? 'controlled static fixture token, restricted to the Kubernetes plugin'
          : 'HTTP fixture only',
        consumer,
        dependencies,
        artifacts,
      },
      null,
      2,
    )}\n`,
  );
  const resolutions = {
    ...repositoryManifest.resolutions,
    '@radius-project/core': dependencies['@radius-project/core'],
    '@radius-project/graph-react': dependencies['@radius-project/graph-react'],
    '@types/react': dependencies['@types/react'],
    '@types/react-dom': dependencies['@types/react-dom'],
  };
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'radius-installed-host', private: true, packageManager: repositoryManifest.packageManager, dependencies, resolutions }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(consumer, '.yarnrc.yml'),
    'nodeLinker: node-modules\n',
  );
  runYarn(['install'], consumer);
  runYarn(['install', '--immutable'], consumer);
  const shared = verifySharedLibraryCandidate(
    candidate,
    candidateDirectory,
    consumer,
  );
  assertCandidateResolution(consumer);
  const react = assertInstalledReact18(consumer);
  fs.cpSync(
    path.join(root, 'plugins', 'plugin-radius', 'fixtures'),
    path.join(consumer, 'fixture'),
    { recursive: true },
  );
  run(
    process.execPath,
    [
      path.join(consumer, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--strict',
      '--noEmit',
      '--skipLibCheck',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--target',
      'ES2022',
      '--jsx',
      'react',
      '--allowSyntheticDefaultImports',
      'fixture/declarations.ts',
      'fixture/legacy.tsx',
      'fixture/native.tsx',
    ],
    consumer,
  );
  const graphRequire = createRequire(path.join(consumer, 'package.json'));
  const stylesheet = graphRequire.resolve(
    '@radius-project/graph-react/styles.css',
  );
  const css = fs.readFileSync(stylesheet);
  try {
    fs.writeFileSync(stylesheet, '');
    assert.throws(
      () =>
        verifySharedLibraryCandidate(candidate, candidateDirectory, consumer),
      /differs from the candidate archive/,
    );
  } finally {
    fs.writeFileSync(stylesheet, css);
  }
  run(process.execPath, [
    path.join(root, 'scripts', 'qualify-plugin-host.ts'),
    consumer,
    '--installed',
  ]);
  run(process.execPath, [
    path.join(root, 'scripts', 'observe-shared-graph.ts'),
    consumer,
  ]);
  if (process.env.QUALIFICATION_CONTAINER_IMAGE) {
    run(
      process.execPath,
      [path.join(root, 'scripts', 'qualify-standalone-host.ts')],
      root,
      {
        QUALIFICATION_INSTALLED_CONSUMER: consumer,
      },
    );
  }
  fs.writeFileSync(
    path.join(consumer, 'qualification.json'),
    `${JSON.stringify(
      {
        stage: process.env.QUALIFICATION_CONTAINER_IMAGE
          ? 'installed-external-frontend-with-container-backend'
          : 'installed-external-frontend',
        // This receipt must not imply completion of the full active host matrix.
        phase5Complete: false,
        openGates: [
          'IA-01/IA-02/IA-03: independent clean installed backend declaration/build/dependency closure',
          ...(process.env.QUALIFICATION_CONTAINER_IMAGE
            ? [
                'HU-12/IA-07: complete BS-01..BS-04 service and two-connection GET/POST isolation matrix',
              ]
            : [
                'HU-12/IA-07: real backend/proxy, initialization failure and GET/POST authorization',
              ]),
          'full native standalone and built-container route/base-path/graph matrix; baseline tests alone do not close it',
          'native API override, cards and themes in the installed host',
        ],
        node: process.version,
        packageManager: repositoryManifest.packageManager,
        repositoryLockSha256: sha256(path.join(root, 'yarn.lock')),
        installedLockSha256: sha256(path.join(consumer, 'yarn.lock')),
        compiler: dependencies.typescript,
        entries: ['@internal/plugin-radius', '@internal/plugin-radius/alpha'],
        backendImage: process.env.QUALIFICATION_CONTAINER_IMAGE ?? null,
        dependencies,
        artifacts,
        shared,
        react,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Installed external frontend evidence: ${recordDirectory}`);
} catch (error) {
  fs.writeFileSync(path.join(consumer, 'failure.txt'), `${String(error)}\n`);
  console.error(
    `Qualification failed. Evidence retained at ${recordDirectory}`,
  );
  throw error;
} finally {
  if (consumer !== recordDirectory) {
    for (const name of [
      'archives',
      'fixture',
      'package.json',
      'yarn.lock',
      '.yarnrc.yml',
      'tuple.json',
      'browser',
      'qualification.json',
      'failure.txt',
    ]) {
      const source = path.join(consumer, name);
      if (fs.existsSync(source)) {
        fs.cpSync(source, path.join(recordDirectory, name), {
          recursive: true,
        });
      }
    }
  }
}
