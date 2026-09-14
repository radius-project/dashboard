/**
 * Build-time package qualification. The fixture resolves the local tarballs
 * from an isolated node_modules tree while repository dependencies remain
 * available for declaration checking. Phase 5 replaces this with a fully clean
 * install and host build.
 */
/* eslint-disable no-restricted-imports */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import * as publicApi from './index';

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

const repoRoot = path.resolve(__dirname, '../../..');
const artifactRoot = path.join(repoRoot, '.copilot-tracking', 'plugin-package');
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
let sourcePluginManifestBeforePack: string;
let sourcePluginManifestAfterPack: string;

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

const packWorkspace = (workspace: string, output: string) => {
  runYarn(['workspace', workspace, 'build']);
  runYarn(['workspace', workspace, 'pack', '--out', output]);
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
  fs.rmSync(artifactRoot, { recursive: true, force: true });
  fs.mkdirSync(artifactRoot, { recursive: true });

  sourcePluginManifestBeforePack = fs.readFileSync(pluginManifestPath, 'utf8');
  packWorkspace('@radapp.io/rad-components', graphArchive);
  packWorkspace('@internal/plugin-radius', pluginArchive);
  sourcePluginManifestAfterPack = fs.readFileSync(pluginManifestPath, 'utf8');
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
}, 180_000);

afterAll(() => {
  fs.rmSync(artifactRoot, { recursive: true, force: true });
});

describe('built plugin artifact', () => {
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

  it('PU-27b: restores the source manifest after prepack and postpack', () => {
    expect(sourcePluginManifestAfterPack).toBe(sourcePluginManifestBeforePack);
    expect(readJson<PackedPackageJson>(pluginManifestPath)).toMatchObject({
      main: 'src/index.ts',
      types: 'src/index.ts',
      private: true,
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
      license: 'Apache-2.0',
      files: ['dist'],
      sideEffects: false,
      backstage: {
        role: 'frontend-plugin',
        pluginId: 'radius',
        pluginPackages: ['@internal/plugin-radius'],
      },
    });
    expect(manifest.private).toBe(true);
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
