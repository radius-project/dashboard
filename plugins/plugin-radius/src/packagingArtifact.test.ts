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
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { createApiFactory } from '@backstage/core-plugin-api';
import { renderTestApp } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { Route } from 'react-router-dom';
import type { FrontendPlugin } from '@backstage/frontend-plugin-api';
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
let packedLegacy: typeof publicApi;
let packedNative: FrontendPlugin;

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

    // Only third-party dependencies are linked. Both Radius packages above
    // come from the candidate archives, never workspace source or aliases.
    const dependencies = [
      '@backstage',
      '@material-ui',
      '@date-io',
      'react',
      'react-dom',
      'react-router-dom',
      'react-use',
      'react-error-boundary',
      '@dagrejs',
      'dagre',
      'reactflow',
    ];
    for (const name of dependencies) {
      const destination = path.join(consumerRoot, 'node_modules', name);
      fs.symlinkSync(
        path.join(repoRoot, 'node_modules', name),
        destination,
        'junction',
      );
    }
    for (const [name, entry] of [
      ['legacy', '@internal/plugin-radius'],
      ['native', '@internal/plugin-radius/alpha'],
    ]) {
      const source = path.join(consumerRoot, `${name}.ts`);
      fs.writeFileSync(
        source,
        name === 'native'
          ? `export { default } from '${entry}';`
          : `export * from '${entry}';`,
      );
      run(process.execPath, [
        require.resolve('esbuild/bin/esbuild'),
        source,
        '--bundle',
        '--format=cjs',
        '--platform=node',
        '--packages=external',
        `--outfile=${path.join(consumerRoot, `${name}.cjs`)}`,
        `--alias:${entry}=${require.resolve(entry, { paths: [consumerRoot] })}`,
        `--alias:@radapp.io/rad-components=${path.join(graphInstall, 'dist', 'index.esm.js')}`,
      ]);
    }
    // Jest must load these generated CJS fixtures in its own module realm.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    packedLegacy = require(path.join(consumerRoot, 'legacy.cjs'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    packedNative = require(path.join(consumerRoot, 'native.cjs')).default;

    fs.writeFileSync(
      path.join(consumerRoot, 'index.ts'),
      [
        "import { ApplicationListPage, radiusApiRef, radiusPlugin } from '@internal/plugin-radius';",
        "import type { RadiusApi } from '@internal/plugin-radius';",
        "import nativeRadius from '@internal/plugin-radius/alpha';",
        'declare const api: RadiusApi;',
        'void api.listApplications();',
        'void ApplicationListPage;',
        'void radiusApiRef;',
        'void radiusPlugin.getId();',
        'const nativeId: string = nativeRadius.pluginId;',
        'void nativeId;',
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
    expect(() => {
      try {
        runYarn(['tsc', '--project', path.join(consumerRoot, 'tsconfig.json')]);
      } catch (error) {
        if (error instanceof Error && 'stdout' in error) {
          throw new Error(String(error.stdout), { cause: error });
        }
        throw error;
      }
    }).not.toThrow();
  });

  it('FS-07: ships a native default entry and rewrites source exports', () => {
    const manifest = readJson<{
      exports: Record<string, unknown>;
      backstage: {
        features: Record<string, string>;
      };
    }>(path.join(pluginInstall, 'package.json'));
    expect(manifest.backstage.features).toEqual({
      './alpha': '@backstage/FrontendPlugin',
    });
    expect(JSON.stringify(manifest.exports)).not.toContain('src/');
    expect(
      fs.existsSync(path.join(pluginInstall, 'dist', 'alpha.esm.js')),
    ).toBe(true);
    expect(
      fs.readFileSync(path.join(pluginInstall, 'dist', 'alpha.d.ts'), 'utf8'),
    ).toContain('default');
  });

  describe.each(['legacy', 'native'] as const)(
    'FS-08: packed %s host',
    system => {
      const applicationId =
        '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/applications/packed-app';
      const environmentId =
        '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/environments/demo';
      const application = {
        id: applicationId,
        name: 'packed-app',
        type: 'Applications.Core/applications',
        properties: { environment: environmentId },
      };
      const environment = {
        id: environmentId,
        name: 'demo',
        type: 'Applications.Core/environments',
        properties: {},
      };
      const graph = readJson(
        path.join(
          repoRoot,
          'packages',
          'app',
          'e2e-tests',
          'fixtures',
          'multi-tier.json',
        ),
      );
      const kubernetes = {
        getObjectsByEntity: jest.fn(),
        getCluster: jest.fn(),
        getWorkloadsByEntity: jest.fn(),
        getCustomObjectsByEntity: jest.fn(),
        getClusters: jest
          .fn()
          .mockResolvedValue([
            { name: 'packed-cluster', authProvider: 'serviceAccount' },
          ]),
        proxy: jest
          .fn()
          .mockImplementation(
            async ({ path: requestPath }: { path: string }) => {
              let response: unknown = { value: [] };
              if (requestPath.includes('/getGraph?')) response = graph;
              else if (requestPath.includes('/resourceTypes/applications?'))
                response = {
                  Name: 'applications',
                  Description: 'Applications',
                  ResourceProviderNamespace: 'Applications.Core',
                  APIVersions: { '2025-01-01': {} },
                  APIVersionList: ['2025-01-01'],
                };
              else if (requestPath.includes(`${applicationId}?`))
                response = application;
              else if (requestPath.includes(`${environmentId}?`))
                response = environment;
              else if (requestPath.includes('/Applications.Core/applications?'))
                response = { value: [application] };
              else if (requestPath.includes('/Applications.Core/environments?'))
                response = { value: [environment] };
              return new Response(JSON.stringify(response));
            },
          ),
      };

      const mount = (route: string) => {
        if (system === 'native') {
          return renderTestApp({
            features: [packedNative],
            initialRouteEntries: [route],
            apis: [[kubernetesApiRef, kubernetes]],
          });
        }
        window.history.replaceState({}, '', route);
        const host = createApp({
          apis: [
            createApiFactory({
              api: kubernetesApiRef,
              deps: {},
              factory: () => kubernetes,
            }),
          ],
        });
        const pages = [
          ['/applications', packedLegacy.ApplicationListPage],
          ['/environments', packedLegacy.EnvironmentListPage],
          ['/recipes', packedLegacy.RecipeListPage],
          ['/resources', packedLegacy.ResourceListPage],
          ['/resource-types', packedLegacy.ResourceTypesListPage],
          [
            '/resource-types/:namespace/:typeName',
            packedLegacy.ResourceTypeDetailPage,
          ],
          [
            '/resources/:group/:namespace/:type/:name',
            packedLegacy.ResourcePage,
          ],
          [
            '/environments/:group/:namespace/:type/:name',
            packedLegacy.EnvironmentPage,
          ],
        ] as const;
        const Root = host.createRoot(
          React.createElement(
            AppRouter,
            {},
            React.createElement(FlatRoutes, {
              children: pages.map(([routePath, Component]) =>
                React.createElement(Route, {
                  key: routePath,
                  path: routePath,
                  element: React.createElement(Component),
                }),
              ),
            }),
          ),
        );
        return render(React.createElement(Root));
      };

      afterEach(cleanup);

      it.each([
        ['/applications', 'Applications'],
        ['/environments', 'Environments'],
        ['/recipes', 'Recipes'],
        ['/resources', 'Resources'],
        ['/resource-types', 'Resource Types'],
        ['/resource-types/Applications.Core/applications', 'applications'],
        [
          '/resources/demo/Applications.Core/applications/packed-app/overview',
          'Resource',
        ],
        [
          '/environments/demo/Applications.Core/environments/demo/overview',
          'Environment',
        ],
      ])(
        'loads %s through registration and shipped lazy imports',
        async (route, title) => {
          mount(route);
          expect(
            await screen.findByRole(
              'heading',
              { name: title, level: 1 },
              { timeout: 10_000 },
            ),
          ).toBeInTheDocument();
        },
      );
    },
  );

  it('FS-03/08: runs real-renderer browser journeys in both packed external hosts', () => {
    try {
      const result = run(process.execPath, [
        path.join(repoRoot, 'scripts', 'qualify-plugin-host.ts'),
        consumerRoot,
      ]);
      expect(result).toContain('FS-03/08 PASS: packed legacy');
      expect(result).toContain('FS-03/08 PASS: packed native');
    } catch (error) {
      if (error instanceof Error && 'stderr' in error) {
        throw new Error(String(error.stderr), { cause: error });
      }
      throw error;
    }
  }, 180_000);

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
