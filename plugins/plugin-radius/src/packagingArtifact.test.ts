/**
 * Build-time package qualification. This is not a unit test: it runs a real
 * `yarn build` and `yarn pack`, and Backstage's `prepack` rewrites the workspace
 * manifest on disk while it does. It therefore runs alone, through
 * `yarn test:package`, rather than inside the repository Jest run — nothing else
 * may read those manifests concurrently, and a run that is killed mid-pack must
 * not leave a tracked file rewritten behind other passing tests.
 *
 * The fixture resolves the local tarballs from an isolated node_modules tree
 * while repository dependencies remain available for declaration checking.
 * Phase 5 replaces this with a fully clean install and host build.
 */
/* eslint-disable no-restricted-imports */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as publicApi from './index';

/**
 * Set by `yarn test:package`. Without it the suite does not run, because the
 * repository Jest run must not trigger a build and pack. PP-01 asserts that the
 * script and its CI step exist and target this file, so the guard cannot make
 * the qualification disappear silently.
 */
const qualifying = process.env.PACKAGE_QUALIFICATION === 'true';

interface PackedPackageJson {
  name: string;
  private?: boolean;
  main: string;
  types: string;
  license: string;
  files: string[];
  sideEffects: boolean;
  backstage: {
    role: string;
    pluginId: string;
    pluginPackages: string[];
  };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface ManifestLifecycle {
  before: string;
  after: string;
}

const repoRoot = path.resolve(__dirname, '../../..');
// A private temp directory, never a tracked path: the cleanup below is a
// recursive delete, and the agent scratch directory holds real working files.
const artifactRoot = qualifying
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'radius-plugin-package-'))
  : '';
const pluginArchive = path.join(artifactRoot, 'plugin.tgz');
const graphArchive = path.join(artifactRoot, 'rad-components.tgz');
const consumerRoot = path.join(artifactRoot, 'consumer');
const pluginInstall = path.join(
  consumerRoot,
  'node_modules',
  '@internal',
  'plugin-radius',
);
const graphInstall = path.join(
  consumerRoot,
  'node_modules',
  '@radapp.io',
  'rad-components',
);
const pluginManifestPath = path.join(
  repoRoot,
  'plugins',
  'plugin-radius',
  'package.json',
);
const graphManifestPath = path.join(
  repoRoot,
  'packages',
  'rad-components',
  'package.json',
);
let pluginManifestLifecycle: ManifestLifecycle;
let graphManifestLifecycle: ManifestLifecycle;

const run = (command: string, args: string[]) =>
  execFileSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const runYarn = (args: string[]) => {
  if (process.platform === 'win32') {
    return run(process.execPath, [
      path.join(
        path.dirname(process.execPath),
        'node_modules',
        'corepack',
        'dist',
        'yarn.js',
      ),
      ...args,
    ]);
  }
  return run('yarn', args);
};

const packWorkspace = (
  workspace: string,
  output: string,
  manifestPath: string,
): ManifestLifecycle => {
  const before = fs.readFileSync(manifestPath, 'utf8');

  try {
    runYarn(['workspace', workspace, 'build']);
    runYarn(['workspace', workspace, 'pack', '--out', output]);
    return {
      before,
      after: fs.readFileSync(manifestPath, 'utf8'),
    };
  } finally {
    if (fs.readFileSync(manifestPath, 'utf8') !== before) {
      fs.writeFileSync(manifestPath, before);
    }
  }
};

const extractArchive = (archive: string, destination: string) => {
  fs.mkdirSync(destination, { recursive: true });
  run('tar', ['-xf', archive, '-C', destination, '--strip-components=1']);
};

const readJson = <Value>(file: string) =>
  JSON.parse(fs.readFileSync(file, 'utf8')) as Value;

const runtimeExports = (entryPoint: string) =>
  [...fs.readFileSync(entryPoint, 'utf8').matchAll(/export \{([^}]+)\}/g)]
    .flatMap(match => match[1].split(','))
    .map(value =>
      value
        .trim()
        .split(/\s+as\s+/)
        .at(-1),
    )
    .filter((value): value is string => Boolean(value))
    .sort();

beforeAll(() => {
  if (!qualifying) return;
  fs.mkdirSync(artifactRoot, { recursive: true });

  try {
    graphManifestLifecycle = packWorkspace(
      '@radapp.io/rad-components',
      graphArchive,
      graphManifestPath,
    );
    pluginManifestLifecycle = packWorkspace(
      '@internal/plugin-radius',
      pluginArchive,
      pluginManifestPath,
    );
    extractArchive(pluginArchive, pluginInstall);
    extractArchive(graphArchive, graphInstall);

    fs.writeFileSync(
      path.join(consumerRoot, 'index.ts'),
      [
        "import { ApplicationListPage, radiusApiRef, radiusPlugin } from '@internal/plugin-radius';",
        "import type { RadiusApi } from '@internal/plugin-radius';",
        'declare const api: RadiusApi;',
        'void api.listApplications();',
        'void ApplicationListPage;',
        'void radiusApiRef;',
        'void radiusPlugin.getId();',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(consumerRoot, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            module: 'ESNext',
            moduleResolution: 'Bundler',
            target: 'ES2022',
          },
          include: ['index.ts'],
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
    throw error;
  }
}, 180_000);

afterAll(() => {
  if (!qualifying) return;
  fs.rmSync(artifactRoot, { recursive: true, force: true });
});

(qualifying ? describe : describe.skip)('built plugin artifact', () => {
  it('PU-26: exposes the same runtime exports from dist as the source entry point', () => {
    expect(
      runtimeExports(path.join(pluginInstall, 'dist', 'index.esm.js')),
    ).toEqual(Object.keys(publicApi).sort());
  });

  it('PU-27: compiles declarations from an isolated packed consumer', () => {
    expect(() =>
      runYarn(['tsc', '--project', path.join(consumerRoot, 'tsconfig.json')]),
    ).not.toThrow();
  });

  it('PU-27a: resolves both candidate tarballs instead of workspace source', () => {
    expect(
      require.resolve('@internal/plugin-radius/package.json', {
        paths: [consumerRoot],
      }),
    ).toBe(path.join(pluginInstall, 'package.json'));
    expect(
      require.resolve('@radapp.io/rad-components/package.json', {
        paths: [consumerRoot],
      }),
    ).toBe(path.join(graphInstall, 'package.json'));
  });

  it('PU-27b: restores both source manifests after build and pack', () => {
    expect(pluginManifestLifecycle.after).toBe(pluginManifestLifecycle.before);
    expect(graphManifestLifecycle.after).toBe(graphManifestLifecycle.before);
    // The source development contract: both entry points resolve to TypeScript
    // source, not to build output left behind by prepack.
    expect(readJson<PackedPackageJson>(pluginManifestPath)).toMatchObject({
      main: 'src/index.ts',
      types: 'src/index.ts',
    });
  });

  it('PU-27c: packs current metadata and built files without workspace ranges', () => {
    const manifest = readJson<PackedPackageJson>(
      path.join(pluginInstall, 'package.json'),
    );
    const dependencyEntries = Object.entries(manifest.dependencies ?? {});

    expect(manifest).toMatchObject({
      name: '@internal/plugin-radius',
      main: 'dist/index.esm.js',
      types: 'dist/index.d.ts',
      files: ['dist'],
      sideEffects: false,
      backstage: {
        role: 'frontend-plugin',
        pluginId: 'radius',
        pluginPackages: ['@internal/plugin-radius'],
      },
    });
    expect(
      dependencyEntries.filter(([, range]) => range.startsWith('workspace:')),
    ).toEqual([]);
    expect(Object.keys(manifest.peerDependencies ?? {}).sort()).toEqual([
      'react',
      'react-dom',
      'react-router-dom',
    ]);
    expect(fs.existsSync(path.join(pluginInstall, 'dist', 'index.d.ts'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(pluginInstall, 'src'))).toBe(false);
  });
});
