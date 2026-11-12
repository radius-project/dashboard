import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  assertCandidateResolution,
  assertInstalledReact18,
  installedPackage,
  isInsidePath,
  sha256,
} from './installed-host.ts';
import {
  verifySharedLibraryCandidate,
  type SharedLibraryCandidate,
} from './shared-library-candidate.ts';

const root = process.cwd();
const fullMatrix = process.env.QUALIFICATION_FULL_HOST_MATRIX === 'true';
const evidence = process.env.QUALIFICATION_EVIDENCE_DIRECTORY;
if (!evidence || !path.isAbsolute(evidence)) {
  throw new Error(
    'Set QUALIFICATION_EVIDENCE_DIRECTORY to a persistent absolute directory',
  );
}
fs.mkdirSync(evidence, { recursive: true });
if (isInsidePath(root, evidence)) {
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
  assert(
    !isInsidePath(root, workDirectory),
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
const hostManifests = fullMatrix
  ? ['app', 'backend'].map(name => ({
      directory: path.join('packages', name),
      manifest: JSON.parse(
        fs.readFileSync(
          path.join(root, 'packages', name, 'package.json'),
          'utf8',
        ),
      ),
    }))
  : [];

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
  const packageNames = new Set([
    '@backstage/app-defaults',
    '@backstage/config',
    '@backstage/core-app-api',
    '@backstage/core-compat-api',
    '@backstage/core-components',
    '@backstage/core-plugin-api',
    '@backstage/frontend-defaults',
    '@backstage/frontend-plugin-api',
    '@backstage/plugin-app-react',
    '@backstage/plugin-kubernetes',
    '@backstage/theme',
    '@material-ui/core',
    '@types/react',
    '@types/react-dom',
    'react',
    'react-dom',
    'reactflow',
    'react-router-dom',
    'typescript',
    ...hostManifests
      .flatMap(host => Object.keys(host.manifest.dependencies))
      .filter(name => !name.startsWith('@internal/')),
  ]);
  for (const name of packageNames) {
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
    `${JSON.stringify({ name: 'radius-installed-host', private: true, packageManager: repositoryManifest.packageManager, dependencies, resolutions, ...(fullMatrix ? { workspaces: ['packages/*'] } : {}) }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(consumer, '.yarnrc.yml'),
    `nodeLinker: node-modules\n${fullMatrix ? 'enableScripts: true\n' : ''}`,
  );
  if (fullMatrix) {
    for (const host of hostManifests) {
      const directory = path.join(consumer, host.directory);
      fs.mkdirSync(directory, { recursive: true });
      for (const name of ['src', 'public']) {
        const source = path.join(root, host.directory, name);
        if (fs.existsSync(source))
          fs.cpSync(source, path.join(directory, name), {
            recursive: true,
            filter: file =>
              !/\.(test|spec)\.[jt]sx?$/.test(file) &&
              path.basename(file) !== 'setupTests.ts',
          });
      }
      const { devDependencies: _dev, jest: _jest, ...manifest } = host.manifest;
      manifest.dependencies = Object.fromEntries(
        Object.keys(host.manifest.dependencies).map(name => [
          name,
          name === '@internal/app'
            ? 'workspace:*'
            : artifacts[name]
              ? `file:../../archives/${path.basename(artifacts[name].file)}`
              : dependencies[name],
        ]),
      );
      fs.writeFileSync(
        path.join(directory, 'package.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
    }
    for (const file of [
      'tsconfig.json',
      'backstage.json',
      'app-config.yaml',
      'app-config.dashboard.yaml',
      '.dockerignore',
    ]) {
      fs.copyFileSync(path.join(root, file), path.join(consumer, file));
    }
    fs.copyFileSync(
      path.join(root, 'packages', 'backend', 'Dockerfile'),
      path.join(consumer, 'packages', 'backend', 'Dockerfile'),
    );
  }
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
      '--ignoreConfig',
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
  if (fullMatrix) {
    runYarn(['tsc'], consumer);
    run(
      process.execPath,
      [
        path.join(
          consumer,
          'node_modules',
          '@backstage',
          'cli',
          'bin',
          'backstage-cli',
        ),
        'package',
        'build',
      ],
      path.join(consumer, 'packages', 'backend'),
    );
  }
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
  let backendImage = process.env.QUALIFICATION_CONTAINER_IMAGE;
  if (fullMatrix) {
    run(
      process.execPath,
      [
        path.join(root, 'scripts', 'qualify-standalone-host.ts'),
        'nativeHost.test.ts',
      ],
      root,
      {
        QUALIFICATION_INSTALLED_BACKEND: consumer,
        QUALIFICATION_CONTAINER_IMAGE: '',
        QUALIFICATION_FULL_HOST_JOURNEYS: '',
        QUALIFICATION_APP_BASE_PATH: '',
        QUALIFICATION_PLUGIN_MOUNT_PATH: '',
        QUALIFICATION_EVIDENCE_DIRECTORY: path.join(
          recordDirectory,
          'matrix',
          'standalone-baseline',
        ),
      },
    );
    for (const basePath of ['', '/nested']) {
      run(
        process.execPath,
        [path.join(root, 'scripts', 'qualify-standalone-host.ts')],
        root,
        {
          QUALIFICATION_FULL_HOST_JOURNEYS: 'true',
          QUALIFICATION_INSTALLED_BACKEND: consumer,
          QUALIFICATION_CONTAINER_IMAGE: '',
          QUALIFICATION_APP_BASE_PATH: basePath,
          QUALIFICATION_PLUGIN_MOUNT_PATH: '/plugins/radius',
          QUALIFICATION_EVIDENCE_DIRECTORY: path.join(
            recordDirectory,
            'matrix',
            basePath ? 'standalone-nested' : 'standalone-root',
          ),
        },
      );
    }
    if (backendImage) {
      backendImage = `radius-phase5-installed:${artifacts['@internal/plugin-radius'].sha256.slice(0, 16)}`;
      run(
        'docker',
        [
          'build',
          '--file',
          path.join('packages', 'backend', 'Dockerfile'),
          '--tag',
          backendImage,
          '--label',
          `io.radius.qualification.plugin-sha256=${artifacts['@internal/plugin-radius'].sha256}`,
          '--label',
          `io.radius.qualification.backend-sha256=${sha256(path.join(consumer, 'packages', 'backend', 'src', 'createRadiusBackend.ts'))}`,
          ...(process.env.QUALIFICATION_SOURCE_REVISION
            ? [
                '--label',
                `org.opencontainers.image.revision=${process.env.QUALIFICATION_SOURCE_REVISION}`,
              ]
            : []),
          '.',
        ],
        consumer,
      );
      run(
        process.execPath,
        [
          path.join(root, 'scripts', 'qualify-standalone-host.ts'),
          'nativeHost.test.ts',
        ],
        root,
        {
          QUALIFICATION_CONTAINER_IMAGE: backendImage,
          QUALIFICATION_FULL_HOST_JOURNEYS: '',
          QUALIFICATION_APP_BASE_PATH: '',
          QUALIFICATION_PLUGIN_MOUNT_PATH: '',
          QUALIFICATION_EVIDENCE_DIRECTORY: path.join(
            recordDirectory,
            'matrix',
            'container-baseline',
          ),
        },
      );
      for (const basePath of ['', '/nested']) {
        run(
          process.execPath,
          [path.join(root, 'scripts', 'qualify-standalone-host.ts')],
          root,
          {
            QUALIFICATION_FULL_HOST_JOURNEYS: 'true',
            QUALIFICATION_CONTAINER_IMAGE: backendImage,
            QUALIFICATION_APP_BASE_PATH: basePath,
            QUALIFICATION_PLUGIN_MOUNT_PATH: '/plugins/radius',
            QUALIFICATION_EVIDENCE_DIRECTORY: path.join(
              recordDirectory,
              'matrix',
              basePath ? 'container-nested' : 'container-root',
            ),
          },
        );
      }
    }
  }
  if (backendImage) {
    run(
      process.execPath,
      [path.join(root, 'scripts', 'qualify-standalone-host.ts')],
      root,
      {
        QUALIFICATION_INSTALLED_CONSUMER: consumer,
        QUALIFICATION_CONTAINER_IMAGE: backendImage,
      },
    );
  }
  fs.writeFileSync(
    path.join(consumer, 'qualification.json'),
    `${JSON.stringify(
      {
        stage: fullMatrix
          ? 'clean-installed-active-host-matrix'
          : process.env.QUALIFICATION_CONTAINER_IMAGE
            ? 'installed-external-frontend-with-container-backend'
            : 'installed-external-frontend',
        phase5Complete: fullMatrix && Boolean(backendImage),
        openGates: [
          ...(!fullMatrix
            ? [
                'IA-01/IA-02/IA-03: independent clean installed backend declaration/build/dependency closure',
                'full native standalone and built-container route/base-path/graph matrix; baseline tests alone do not close it',
                'HU-12/BS-02: installed backend missing required service',
              ]
            : []),
          ...(!backendImage
            ? ['HU-12/IA-07: built-container backend and full frontend matrix']
            : []),
        ],
        node: process.version,
        packageManager: repositoryManifest.packageManager,
        repositoryLockSha256: sha256(path.join(root, 'yarn.lock')),
        installedLockSha256: sha256(path.join(consumer, 'yarn.lock')),
        compiler: dependencies.typescript,
        entries: ['@internal/plugin-radius', '@internal/plugin-radius/alpha'],
        backendImage: backendImage ?? null,
        sourceRevision: process.env.QUALIFICATION_SOURCE_REVISION ?? null,
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
      'packages',
      'dist-types',
      'tsconfig.json',
      'backstage.json',
      'app-config.yaml',
      'app-config.dashboard.yaml',
    ]) {
      const source = path.join(consumer, name);
      if (fs.existsSync(source)) {
        fs.cpSync(source, path.join(recordDirectory, name), {
          recursive: true,
          filter: file => path.basename(file) !== 'node_modules',
        });
      }
    }
  }
}
